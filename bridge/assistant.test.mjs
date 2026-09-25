import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createAssistant, validateAssistantInput } from "./assistant.mjs";

test("assistant accepts bounded PCM and strips arbitrary worker arguments", () => {
  const audio = Buffer.alloc(3200).toString("base64");
  assert.deepEqual(
    validateAssistantInput({
      action: "transcribe",
      audio,
      language: "fr",
      python: "other.exe",
      model: "evil",
    }),
    { action: "transcribe", audio, language: "fr" },
  );
  for (const value of [
    "",
    "../file",
    Buffer.alloc(3201).toString("base64"),
    Buffer.alloc(1920002).toString("base64"),
  ])
    assert.throws(() =>
      validateAssistantInput({
        action: "transcribe",
        audio: value,
        language: "fr",
      }),
    );
  assert.throws(() =>
    validateAssistantInput({
      action: "optimize",
      description: "a".repeat(5001),
      language: "en",
      side: "positive",
    }),
  );
  assert.throws(() =>
    validateAssistantInput({
      action: "download",
      target: "https://evil.test/model",
    }),
  );
});

test("PC model choice persists; worker progress, cancellation and errors stay separate from prompts", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mochi-assistant-"));
  let child, invocation;
  const spawnWorker = (exe, args, options) => {
    assert.equal(exe, process.execPath);
    assert.equal(options.windowsHide, true);
    child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin.on("data", (chunk) => {
      invocation = JSON.parse(chunk.toString());
    });
    child.kill = () => {
      queueMicrotask(() => child.emit("close", null));
      return true;
    };
    return child;
  };
  const config = {
    stateDir: dir,
    roots: [{ path: dir }],
    assistantPython: process.execPath,
  };
  let pc = createAssistant(config, { spawnWorker });
  try {
    await pc.configure({ model: "small", device: "cpu" });
    pc.close();
    pc = createAssistant(config, { spawnWorker });
    assert.equal(pc.status().model, "small");
    assert.equal(pc.status().device, "cpu");
    const job = pc.start({ action: "download", target: "danbot" });
    assert.deepEqual(invocation.keys, ["danbot", "fr-en"]);
    assert.throws(() => pc.start({ action: "download", target: "whisper" }), {
      status: 409,
    });
    child.stdout.write(
      JSON.stringify({ phase: "downloading", received: 150, size: 1000 }) +
        "\n",
    );
    assert.equal(pc.status().received, 150);
    assert.equal(pc.get(job.id).received, 150);
    assert.equal(pc.cancel(job.id).phase, "cancelled");
    child.stdout.write(
      JSON.stringify({ phase: "complete", text: "late private result" }) + "\n",
    );
    assert.equal(pc.get(job.id).text, "");
    await new Promise((r) => setImmediate(r));
    const next = pc.start({ action: "download", target: "whisper" });
    child.stdout.write(
      JSON.stringify({ phase: "error", error: "Download failed" }) + "\n",
    );
    child.emit("close", 1);
    assert.equal(pc.get(next.id).phase, "error");
    assert.equal(pc.status().error, "Download failed");
    assert.equal("text" in pc.status(), false);
    assert.equal("child" in pc.get(next.id), false);
    assert.throws(() => pc.get("unknown"), { status: 404 });
  } finally {
    pc.close();
    await rm(dir, { recursive: true, force: true });
  }
});
