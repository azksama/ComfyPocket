import sharp from "sharp";
import { createHash } from "node:crypto";
sharp.cache({ memory: 32, files: 10, items: 64 });

const renderThumbnail = (input) =>
  sharp(input, { limitInputPixels: 67108864 })
    .rotate()
    .resize({
      width: 480,
      height: 480,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();

export function createThumbnailer({
  maxBytes = 16 * 1024 * 1024,
  maxEntries = 200,
  concurrency = 2,
  render = renderThumbnail,
} = {}) {
  const cache = new Map(),
    pending = new Map(),
    queue = [];
  let bytes = 0,
    active = 0;

  async function produce(input, key) {
    if (active >= concurrency)
      await new Promise((resolve) => queue.push(resolve));
    else active++;
    try {
      const result = await render(input);
      // Do not retain a single result larger than the entire cache budget.
      if (result.length <= maxBytes && maxEntries > 0) {
        while (
          cache.size &&
          (bytes + result.length > maxBytes || cache.size >= maxEntries)
        ) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        cache.set(key, result);
        bytes += result.length;
      }
      return result;
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  }

  return function thumbnail(input, key) {
    // ComfyUI can overwrite an output using the same filename and byte size.
    // Its actual bytes, not their length, identify an upstream image.
    if (Buffer.isBuffer(input))
      key += ":" + createHash("sha256").update(input).digest("hex");
    const saved = cache.get(key);
    if (saved) {
      cache.delete(key);
      cache.set(key, saved);
      return Promise.resolve(saved);
    }
    if (pending.has(key)) return pending.get(key);
    const task = produce(input, key).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  };
}

export const thumbnail = createThumbnailer();
