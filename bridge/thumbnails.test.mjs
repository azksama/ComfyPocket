import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createThumbnailer, thumbnail } from "./thumbnails.mjs";
test("gallery thumbnails fit 480 pixels while leaving original bytes intact", async () => {
  const original = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#7088b4" },
  })
    .png()
    .toBuffer();
  const before = Buffer.from(original);
  const small = await thumbnail(original, "fixture-large"),
    meta = await sharp(small).metadata();
  assert.equal(meta.width, 480);
  assert.equal(meta.height, 360);
  assert.equal(meta.format, "jpeg");
  assert.deepEqual(original, before);
  assert.strictEqual(await thumbnail(original, "fixture-large"), small);
});

test("upstream images with the same URL and length do not share stale thumbnails", async () => {
  const cached = createThumbnailer({
    render: async (input) => Buffer.from(input),
  });
  const first = await cached(Buffer.from("old"), "upstream:view.png:3");
  const second = await cached(Buffer.from("new"), "upstream:view.png:3");
  assert.equal(first.toString(), "old");
  assert.equal(second.toString(), "new");
});

test("thumbnail requests share decoding and cap simultaneous image processing", async () => {
  let calls = 0,
    active = 0,
    peak = 0;
  const cached = createThumbnailer({
    concurrency: 2,
    render: async (input) => {
      calls++;
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return Buffer.from(input);
    },
  });
  const results = await Promise.all(
    ["a", "b", "a", "c", "b", "d"].map((key) => cached(key, key)),
  );
  assert.equal(calls, 4);
  assert.equal(peak, 2);
  assert.strictEqual(results[0], results[2]);
  assert.strictEqual(results[1], results[4]);
});

test("thumbnail cache keeps recently used images within its byte budget", async () => {
  const calls = [];
  const cached = createThumbnailer({
    maxBytes: 4,
    render: async (input) => {
      calls.push(input);
      return Buffer.from(input);
    },
  });
  await cached("aa", "a");
  await cached("bb", "b");
  await cached("aa", "a");
  await cached("cc", "c");
  await cached("aa", "a");
  assert.deepEqual(calls, ["aa", "bb", "cc"]);
  await cached("bb", "b");
  assert.deepEqual(calls, ["aa", "bb", "cc", "bb"]);
});

test("failed thumbnails release their processing slot and can be retried", async () => {
  let fail = true;
  const cached = createThumbnailer({
    concurrency: 1,
    render: async (input) => {
      if (input === "bad" && fail) throw new Error("invalid image");
      return Buffer.from(input);
    },
  });
  const results = await Promise.allSettled([
    cached("bad", "bad"),
    cached("good", "good"),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  fail = false;
  assert.equal((await cached("bad", "bad")).toString(), "bad");
});
