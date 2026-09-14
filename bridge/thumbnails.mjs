import sharp from "sharp";
sharp.cache({ memory: 32, files: 10, items: 64 });
const cache = new Map();
let bytes = 0;
export async function thumbnail(input, key) {
  const saved = cache.get(key);
  if (saved) return saved;
  const result = await sharp(input, { limitInputPixels: 67108864 }).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  while (cache.size && (bytes + result.length > 16 * 1024 * 1024 || cache.size >= 200)) {
    const first = cache.keys().next().value; bytes -= cache.get(first).length; cache.delete(first);
  }
  cache.set(key, result); bytes += result.length;
  return result;
}
