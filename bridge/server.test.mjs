import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import selfsigned from "selfsigned";
import { createBridge, safeFile } from "./server.mjs";

test("TLS bridge: authentication, gallery, traversal and API allowlist", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "comfy-pocket-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "output");
  await mkdir(root);
  await mkdir(path.join(root, "nested"));
  await writeFile(
    path.join(root, "nested", "lake.png"),
    Buffer.from([137, 80, 78, 71]),
  );
  await writeFile(path.join(root, "secret.txt"), "private");
  const cert = await selfsigned.generate(
    [{ name: "commonName", value: "localhost" }],
    {
      days: 1,
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }] },
      ],
    },
  );
  const comfy = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ route: req.url, devices: [] }));
  });
  await new Promise((r) => comfy.listen(0, "127.0.0.1", r));
  t.after(() => comfy.close());
  const token = "test-token-".repeat(6);
  const bridge = createBridge({
    key: cert.private,
    cert: cert.cert,
    token,
    roots: [
      { name: "Outputs", path: root },
      { name: "Duplicate root", path: root },
    ],
    comfyUrl: `http://127.0.0.1:${comfy.address().port}`,
  });
  await new Promise((r) => bridge.listen(0, "127.0.0.1", r));
  t.after(() => bridge.close());
  const call = (url, headers = { Authorization: `Bearer ${token}` }) =>
    new Promise((resolve, reject) => {
      https
        .get(
          {
            hostname: "127.0.0.1",
            servername: "localhost",
            port: bridge.address().port,
            path: url,
            ca: cert.cert,
            headers,
          },
          (r) => {
            const chunks = [];
            r.on("data", (c) => chunks.push(c));
            r.on("end", () =>
              resolve({
                status: r.statusCode,
                text: Buffer.concat(chunks).toString(),
              }),
            );
          },
        )
        .on("error", reject);
    });
  assert.equal((await call("/bridge/gallery", {})).status, 401);
  assert.equal(
    (
      await call("/bridge/gallery", {
        Authorization: `Bearer ${token}`,
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const gallery = await call("/bridge/gallery");
  assert.equal(gallery.status, 200);
  assert.equal(JSON.parse(gallery.text).total, 1);
  assert.equal(JSON.parse(gallery.text).items[0].relative, "nested/lake.png");
  assert.equal(
    (await call("/bridge/gallery?q=absent")).text.includes('"total":0'),
    true,
  );
  assert.equal(
    (await call("/bridge/file?root=0&relative=nested%2Flake.png")).status,
    200,
  );
  assert.equal(
    (await call("/bridge/file?root=0&relative=..%2Fsecret.txt")).status,
    403,
  );
  assert.equal(
    (await call("/bridge/file?root=0&relative=secret.txt")).status,
    403,
  );
  assert.equal((await call("/api/system_stats")).status, 200);
  assert.equal((await call("/api/users")).status, 403);
  assert.equal((await call("/bridge/events?clientId=bad")).status, 400);
  await assert.rejects(safeFile(root, "C:\\Windows\\file.png"));
  await assert.rejects(safeFile(root, "../file.png"));
  assert.equal(
    (await call("/bridge/gallery", { Authorization: "Bearer bad" })).status,
    401,
  );
  await assert.rejects(
    new Promise((resolve, reject) =>
      https
        .get(
          {
            hostname: "127.0.0.1",
            port: bridge.address().port,
            path: "/bridge/info",
          },
          resolve,
        )
        .on("error", reject),
    ),
  );
});
