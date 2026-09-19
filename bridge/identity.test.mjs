import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { certificate } from "./certificate.mjs";
import {
  assertUninitialized,
  defaultConfigDirectory,
  loadIdentity,
} from "./identity.mjs";

test("default identity location belongs to the user, independent of the working directory", () => {
  assert.equal(
    defaultConfigDirectory({ LOCALAPPDATA: "C:/Users/test/AppData/Local" }),
    path.join("C:/Users/test/AppData/Local", "ComfyPocketPC"),
  );
  assert.equal(
    defaultConfigDirectory({ XDG_CONFIG_HOME: "/home/test/.config" }),
    path.join("/home/test/.config", "ComfyPocketPC"),
  );
});

test("partial initialization never permits replacing existing identity files", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "pocket-identity-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assertUninitialized(dir);
  for (const name of [
    "key.pem",
    "cert.pem",
    "config.json",
    "pairing.json",
    "pairing-public.json",
  ]) {
    await writeFile(path.join(dir, name), "preserve this identity");
    await assert.rejects(assertUninitialized(dir), /clés sont conservées/);
    assert.equal(
      await readFile(path.join(dir, name), "utf8"),
      "preserve this identity",
    );
    await rm(path.join(dir, name));
  }
});

test("startup preserves identity bytes and rejects inconsistent keys or pairings", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "pocket-identity-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const original = await certificate(["127.0.0.1"]);
  const another = await certificate(["127.0.0.1"]);
  const files = {
    "config.json": JSON.stringify({ token: "test-token".repeat(8) }),
    "key.pem": original.private,
    "cert.pem": original.cert,
    "pairing.json": JSON.stringify({
      token: "test-token".repeat(8),
      certificate: original.cert,
    }),
  };
  for (const [name, value] of Object.entries(files))
    await writeFile(path.join(dir, name), value);
  await loadIdentity(dir);
  await loadIdentity(dir);
  for (const [name, value] of Object.entries(files))
    assert.equal(await readFile(path.join(dir, name), "utf8"), value);
  await writeFile(path.join(dir, "key.pem"), another.private);
  await assert.rejects(loadIdentity(dir), /ne correspond pas/);
  await writeFile(path.join(dir, "key.pem"), original.private);
  await writeFile(
    path.join(dir, "pairing-public.json"),
    JSON.stringify({
      token: "test-token".repeat(8),
      certificate: another.cert,
    }),
  );
  await assert.rejects(loadIdentity(dir), /Appairage incohérent/);
  assert.equal(
    await readFile(path.join(dir, "cert.pem"), "utf8"),
    original.cert,
  );
});
