import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { installPreview } from "./model-preview.mjs";
import { modelProfile } from "./model-profile.mjs";
import { library } from "./library.mjs";
import { safeFile } from "./server.mjs";
import { inspectModel } from "./model-sources.mjs";
const response = data => Object.assign(Readable.from([data]), { headers: {} });
async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "mochi-preview-"));
  t.after(() => rm(dir, { force: true, recursive: true }));
  return dir;
}
test("illustration is decoded, resized, stripped of metadata and served from default ComfyUI folder", async t => {
  const dir = await fixture(t), base = path.join(dir, "models", "checkpoints");
  await mkdir(base, { recursive: true });
  const model = path.join(base, "example.safetensors");
  const png = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#cab5db" } }).png().toBuffer();
  assert.equal(await installPreview(model, "https://image.civitai.com/image", { provider: "civitai", stream: async () => response(png) }), "downloaded");
  const lib = library({ comfyDirectory: dir, roots: [{ path: path.join(dir, "output") }] }, safeFile);
  const preview = await lib.preview("checkpoints", "example.safetensors");
  const info = await sharp(await readFile(preview)).metadata();
  assert.equal(info.width, 1024); assert.equal(info.height, 512); assert.equal(info.format, "webp");
  assert.equal(info.exif, undefined);
  assert.deepEqual(await readdir(base), ["example.preview.webp"]);
});
test("existing illustration is preserved and not downloaded again", async t => {
  const dir = await fixture(t), model = path.join(dir, "example.pth");
  await writeFile(path.join(dir, "example.preview.jpeg"), "original");
  assert.equal(await installPreview(model, "https://image.civitai.com/image", { stream: () => { throw Error("must not fetch"); } }), "existing");
  assert.equal(await readFile(path.join(dir, "example.preview.jpeg"), "utf8"), "original");
});
test("invalid, oversized or cancelled illustrations leave no files", async t => {
  const dir = await fixture(t), model = path.join(dir, "example.pth");
  for (const data of [Buffer.from("<html>error</html>"), Buffer.alloc(12 * 1024 ** 2 + 1)]) {
    await assert.rejects(installPreview(model, "https://huggingface.co/image", { stream: async () => response(data) }));
  }
  await assert.rejects(installPreview(model, "https://huggingface.co/image", { signal: AbortSignal.abort(), stream: async () => response(Buffer.from("cancelled")) }));
  assert.deepEqual(await readdir(dir), []);
});
test("Civitai preview follows selected version and ignores videos and unsafe hosts", async () => {
  const result = await inspectModel({ url: "https://civitai.red/models/1?modelVersionId=9" }, async () => ({
    model: { type: "Checkpoint" }, baseModel: "Anima", images: [{ type: "video", url: "https://image.civitai.com/video.mp4" }, { url: "https://localhost/secret.png" }, { type: "image", url: "https://image.civitai.com/example.png" }],
    files: [{ id: 1, type: "Model", name: "example.safetensors", downloadUrl: "https://civitai.red/api/download/models/9" }],
  }));
  assert.equal(result.files[0].previewUrl, "https://image.civitai.com/example.png");
  assert.equal(result.files[0].kind, "diffusion_models");
});
test("Hugging Face matches sidecars before cover art, pins images and allows standalone component files", async () => {
  const result = await inspectModel({ url: "https://huggingface.co/a/b" }, async () => ({ sha: "a".repeat(40), siblings: [
    { rfilename: "split_files/text_encoders/qwen_3_06b_base.safetensors" },
    { rfilename: "split_files/vae/qwen_image_vae.safetensors" },
    { rfilename: "split_files/vae/qwen_image_vae.preview.png" },
    { rfilename: "cover.jpg" }, { rfilename: "text_encoder/model.safetensors" },
  ] }));
  assert.equal(result.files.length, 2);
  assert.equal(result.files[0].kind, "text_encoders");
  assert.equal(result.files[1].kind, "vae");
  assert.match(result.files[0].previewUrl, /resolve\/a{40}\/cover.jpg$/);
  assert.match(result.files[1].previewUrl, /qwen_image_vae.preview.png$/);
});
test("model architecture comes from tensor keys, not file names; header reads are bounded", async t => {
  const dir = await fixture(t), model = path.join(dir, "renamed.safetensors");
  async function save(keys) { const body = Buffer.from(JSON.stringify(Object.fromEntries(keys.map(k => [k, {}])))), prefix = Buffer.alloc(8); prefix.writeBigUInt64LE(BigInt(body.length)); await writeFile(model, Buffer.concat([prefix, body])); }
  await save(["model.diffusion_model.blocks.0.mlp.layer1.weight", "model.diffusion_model.llm_adapter.blocks.0.cross_attn.q_proj.weight"]);
  assert.equal((await modelProfile(model)).architecture, "anima");
  const lib = library({ roots: [{ path: dir }], modelPaths: { checkpoints: [dir] } }, safeFile);
  assert.equal((await lib.modelProfile("checkpoints", "renamed.safetensors")).architecture, "anima");
  await assert.rejects(lib.modelProfile("checkpoints", "../renamed.safetensors"), { status: 403 });
  await assert.rejects(lib.modelProfile("checkpoints", "missing.safetensors"), { status: 404 });
  await save(["conditioner.embedders.0.weight", "first_stage_model.weight"]);
  assert.equal((await modelProfile(model)).architecture, "checkpoint");
  await save(["cond_stage_model.weight"]);
  assert.deepEqual(await modelProfile(model), { architecture: "checkpoint", embeddedVae: false });
  await save(["diffusion_model.weight"]);
  assert.equal((await modelProfile(model)).architecture, "separate");
  const invalid = Buffer.alloc(8, 255); await writeFile(model, invalid);
  await assert.rejects(modelProfile(model), /header size/);
});
