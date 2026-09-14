import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { thumbnail } from "./thumbnails.mjs";
test("gallery thumbnails fit 480 pixels while leaving original bytes intact", async () => {
  const original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#7088b4" } }).png().toBuffer();
  const before = Buffer.from(original);
  const small = await thumbnail(original, "fixture-large"), meta = await sharp(small).metadata();
  assert.equal(meta.width, 480); assert.equal(meta.height, 360); assert.equal(meta.format, "jpeg");
  assert.deepEqual(original, before);
  assert.strictEqual(await thumbnail(original, "fixture-large"), small);
});
