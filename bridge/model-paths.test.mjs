import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { library } from "./library.mjs";
import { safeFile } from "./server.mjs";
test("extra LoRA roots expose metadata and previews without escaping the configured directories", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "mochi-extra-models-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lora = path.join(dir, "custom");
  await mkdir(lora);
  await writeFile(
    path.join(lora, "style.cm-info.json"),
    JSON.stringify({ TrainedWords: ["my_style"] }),
  );
  await writeFile(path.join(lora, "style.preview.png"), "preview");
  const lib = library(
    { roots: [{ path: dir }], stateDir: dir, modelPaths: { loras: [lora] } },
    safeFile,
  );
  assert.deepEqual(
    (await lib.modelInfo("loras", "style.safetensors")).triggers,
    ["my_style"],
  );
  assert.equal(
    await readFile(await lib.preview("loras", "style.safetensors"), "utf8"),
    "preview",
  );
  await assert.rejects(lib.preview("loras", "../outside.safetensors"), {
    status: 403,
  });
  await assert.rejects(lib.modelInfo("loras", "../outside.safetensors"), {
    status: 403,
  });
});
