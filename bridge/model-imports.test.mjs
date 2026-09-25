import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { inspectModel, modelFilename } from "./model-sources.mjs";
import { providerUrl, publicAddress } from "./import-network.mjs";
import { createModelImports } from "./model-imports.mjs";
const payload = Buffer.from("model test data");
const hash = createHash("sha256").update(payload).digest("hex");
const file = {
  id: "1",
  name: "model.pth",
  kind: "upscale_models",
  url: "https://huggingface.co/a/b/resolve/main/model.pth",
  size: payload.length,
  sha256: hash,
};
async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "mochi-import-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const models = path.join(dir, "models");
  await mkdir(models);
  const config = {
    stateDir: dir,
    roots: [{ path: path.join(dir, "output") }],
    modelPaths: { upscale_models: [models] },
  };
  const inspect = async () => ({
    provider: "huggingface",
    title: "Model",
    files: [file],
    token: "private-test-token",
  });
  const stream = async () => {
    const r = Readable.from([payload]);
    r.headers = {
      "content-length": String(payload.length),
      "content-type": "application/octet-stream",
    };
    return r;
  };
  const manager = createModelImports(config, { inspect, stream, ...overrides });
  t.after(() => manager.close());
  const plan = await manager.inspect({});
  return { dir, models, config, manager, plan };
}
async function terminal(manager, id) {
  for (let i = 0; i < 300; i++) {
    const j = (await manager.list()).jobs.find((x) => x.id === id);
    if (!["queued", "downloading", "verifying"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("job timeout");
}
test("provider allowlist rejects SSRF, credentials, ports and lookalike domains", () => {
  for (const url of [
    "http://huggingface.co/a/b",
    "https://huggingface.co.evil.test/a/b",
    "https://user:pw@huggingface.co/a/b",
    "https://127.0.0.1/a",
    "https://huggingface.co:8188/a",
  ])
    assert.throws(() => providerUrl(url, "huggingface", true));
  assert.equal(
    providerUrl("https://cas-bridge.xethub.hf.co/file", "huggingface", true)
      .hostname,
    "cas-bridge.xethub.hf.co",
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.31.1.1",
    "192.168.1.8",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
});
test("file names reject traversal, executable payloads and Windows device names", () => {
  for (const n of [
    "../bad.pth",
    "CON.pth",
    "a:b.pth",
    "a\\bad.pth",
    "file.exe",
    "file.zip",
    ".hidden.pth",
  ])
    assert.throws(() => modelFilename(n));
  assert.equal(modelFilename("4x-upscale.pth"), "4x-upscale.pth");
});
test("Civitai red/com pages and explicit versions preserve file choice and type", async () => {
  for (const domain of ["civitai.red", "civitai.com"]) {
    const calls = [];
    const data = {
      name: "Version",
      model: { name: "Example", type: "LORA" },
      baseModel: "SDXL",
      files: [
        {
          id: 42,
          name: "style.safetensors",
          type: "Model",
          downloadUrl: `https://${domain}/api/download/models/2`,
          sizeKB: 10,
          hashes: { SHA256: hash },
        },
      ],
    };
    const result = await inspectModel(
      {
        url: `https://${domain}/models/1/name?modelVersionId=2`,
        token: "secret",
      },
      async (u, o) => {
        calls.push([u, o]);
        return data;
      },
    );
    assert.equal(result.files[0].kind, "loras");
    assert.equal(result.files[0].id, "42");
    assert.equal(calls[0][0], `https://${domain}/api/v1/model-versions/2`);
    assert.equal(calls[0][1].token, "secret");
  }
});
test("Hugging Face repo and file links pin commits, preserve hashes and reject shards", async () => {
  const data = {
    sha: "a".repeat(40),
    id: "test/lora",
    siblings: [
      { rfilename: "style.safetensors", lfs: { sha256: hash, size: 20 } },
      { rfilename: "model-00001-of-00002.safetensors" },
      { rfilename: "vae/diffusion_pytorch_model.safetensors" },
    ],
  };
  for (const suffix of [
    "",
    "/blob/main/style.safetensors",
    "/resolve/main/style.safetensors",
  ]) {
    const result = await inspectModel(
      { url: "https://huggingface.co/test/lora" + suffix },
      async () => data,
    );
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].sha256, hash);
    assert.match(result.files[0].url, new RegExp("resolve/" + data.sha + "/"));
  }
});
test("installation checks SHA256, persists status without credentials and bumps catalog revision", async (t) => {
  const f = await fixture(t);
  assert.ok(!JSON.stringify(f.plan).includes("private-test-token"));
  assert.ok(!JSON.stringify(f.plan).includes("/resolve/"));
  const j = await f.manager.start({
    planId: f.plan.id,
    fileId: "1",
    kind: "upscale_models",
  });
  assert.equal((await terminal(f.manager, j.id)).status, "completed");
  assert.deepEqual(await readFile(path.join(f.models, "model.pth")), payload);
  assert.equal((await f.manager.list()).revision, 1);
  const stored = await readFile(path.join(f.dir, "model-imports.json"), "utf8");
  assert.ok(!stored.includes("private-test-token"));
  assert.ok(!stored.includes("/resolve/"));
  assert.deepEqual(await readdir(f.models), ["model.pth"]);
});
test("existing model is never overwritten", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.models, "model.pth"), "original");
  const j = await f.manager.start({
    planId: f.plan.id,
    fileId: "1",
    kind: "upscale_models",
  });
  assert.equal((await terminal(f.manager, j.id)).status, "error");
  assert.equal(
    await readFile(path.join(f.models, "model.pth"), "utf8"),
    "original",
  );
});
test("checksum failure leaves no installed or partial model", async (t) => {
  const f = await fixture(t, {
    inspect: async () => ({
      provider: "huggingface",
      title: "Bad",
      files: [{ ...file, sha256: "0".repeat(64) }],
      token: "",
    }),
  });
  const j = await f.manager.start({
    planId: f.plan.id,
    fileId: "1",
    kind: "upscale_models",
  });
  assert.match((await terminal(f.manager, j.id)).error, /SHA-256/);
  assert.deepEqual(await readdir(f.models), []);
});
test("cancel removes partial file and later downloads still work", async (t) => {
  let slow = true;
  const f = await fixture(t, {
    stream: async (_u, { signal }) => {
      const r = Readable.from(
        (async function* () {
          yield payload;
          if (slow)
            await new Promise((resolve, reject) => {
              signal.addEventListener("abort", () => reject(Error("abort")), {
                once: true,
              });
              setTimeout(resolve, 1000).unref();
            });
        })(),
      );
      r.headers = {};
      return r;
    },
  });
  const j = await f.manager.start({
    planId: f.plan.id,
    fileId: "1",
    kind: "upscale_models",
  });
  for (
    let i = 0;
    i < 100 && (await f.manager.list()).jobs[0].received === 0;
    i++
  )
    await new Promise((r) => setTimeout(r, 5));
  await f.manager.cancel(j.id);
  assert.equal((await terminal(f.manager, j.id)).status, "cancelled");
  assert.deepEqual(await readdir(f.models), []);
  slow = false;
  const p = await f.manager.inspect({});
  const next = await f.manager.start({
    planId: p.id,
    fileId: "1",
    kind: "upscale_models",
  });
  assert.equal((await terminal(f.manager, next.id)).status, "completed");
});
test("restart marks interrupted downloads and cleans their own partial files", async (t) => {
  const f = await fixture(t);
  const id = "11111111-1111-1111-1111-111111111111";
  await writeFile(path.join(f.models, `.mochi-import-${id}.part`), "partial");
  await writeFile(
    path.join(f.dir, "model-imports.json"),
    JSON.stringify({
      revision: 2,
      jobs: [
        { id, name: "test.pth", kind: "upscale_models", status: "downloading" },
      ],
    }),
  );
  const restored = createModelImports(f.config);
  t.after(() => restored.close());
  assert.equal((await restored.list()).jobs[0].status, "error");
  assert.deepEqual(await readdir(f.models), []);
});
