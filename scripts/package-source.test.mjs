import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { unzipSync } from "fflate";
import { includeSource, packageSource } from "./package-source.mjs";

test("source exclusions handle Windows casing, credential backups and runtime directories", () => {
  for (const file of [
    "src-tauri/key.properties",
    "KEY.PROPERTIES.bak",
    "keystore.properties.old",
    "Signing/notes.txt",
    "ComfyPocketPC/config.json",
    ".bridge/config.json",
    "PASSWORD.TXT",
    "keys/PRIVATE.JKS",
    "cert.pem.backup",
    "credentials.json~",
    "Pairing.json.old",
    "Appairage-PC-public.JSON",
    ".env.production",
    ".npmrc",
    "APP.APK",
    "weights/test.SAFETENSORS",
    "weights/test.pt",
    "debug.log",
    "old.zip",
    "src-tauri\\gen\\android\\app\\src\\main\\jniLibs\\library.so",
  ])
    assert.equal(includeSource(file), false, file);
  for (const file of [
    "package.json",
    "src/App.tsx",
    "bridge/server.mjs",
    "README.md",
    "gradle/wrapper/gradle-wrapper.jar",
    "assets/tags.tsv.gz",
  ]) {
    assert.equal(includeSource(file), true, file);
  }
});

test("source archive keeps project files and excludes fixture secrets and linked directories", async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), "pocket-source-test-"));
  t.after(async () => {
    assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(temp, { recursive: true, force: true });
  });
  const root = path.join(temp, "project"),
    external = path.join(temp, "external");
  const fixtureSecret = "PACKAGING_TEST_SECRET_NOT_A_REAL_CREDENTIAL";
  const files = {
    "package.json": JSON.stringify({ name: "fixture", version: "0.6.0" }),
    "src/App.tsx": "export default function App() {}",
    "src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar":
      "required wrapper fixture",
    "src-tauri/gen/android/key.properties": fixtureSecret,
    "keystore.properties.bak": fixtureSecret,
    "ComfyPocketPC/config.json": fixtureSecret,
    "SIGNING/PASSWORD.TXT": fixtureSecret,
    "node_modules/private.txt": fixtureSecret,
    "dist/App.js": "build output",
    "Appairage-PC.JSON": fixtureSecret,
    ".env.production": fixtureSecret,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  await mkdir(external);
  await writeFile(path.join(external, "private.txt"), fixtureSecret);
  await symlink(
    external,
    path.join(root, "linked-data"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const output = path.join(temp, "result.zip");
  const result = await packageSource({
    root,
    output,
    stagingDirectory: path.join(temp, "stages"),
  });
  assert.equal(result.version, "0.6.0");
  assert.match(result.stage, /source-package-v0\.6\.0-/);
  const entries = unzipSync(await readFile(output));
  assert.ok(entries["ComfyPocket/src/App.tsx"]);
  assert.ok(
    entries[
      "ComfyPocket/src-tauri/gen/android/gradle/wrapper/gradle-wrapper.jar"
    ],
  );
  assert.equal(
    Object.keys(entries).some((name) => name.includes("linked-data")),
    false,
  );
  for (const [name, content] of Object.entries(entries)) {
    assert.equal(Buffer.from(content).includes(fixtureSecret), false, name);
    assert.equal(includeSource(name), true, name);
  }
  assert.equal(
    await readFile(path.join(external, "private.txt"), "utf8"),
    fixtureSecret,
  );
  await assert.rejects(
    packageSource({ root, output, stagingDirectory: path.join(root, "stage") }),
    /hors des sources/,
  );
});
