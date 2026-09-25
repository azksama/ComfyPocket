import { lstat, writeFile, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { remoteStream } from "./import-network.mjs";

const LIMIT = 12 * 1024 ** 2;
export async function installPreview(modelPath, url, { stream = remoteStream, signal, ...options }) {
  const stem = modelPath.replace(/\.[^.]+$/, "");
  for (const base of [stem, modelPath]) for (const ext of ["jpeg", "jpg", "png", "webp"])
    if (await lstat(`${base}.preview.${ext}`).catch(e => {
      if (e.code !== "ENOENT") throw e;
      return null;
    })) return "existing";
  if (!url) return "unavailable";
  const timeout = AbortSignal.timeout(20000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await stream(url, { ...options, signal: combined, download: true });
  const chunks = [];
  let size = 0;
  try {
    if (Number(response.headers["content-length"]) > LIMIT) throw Error("Illustration too large");
    for await (const chunk of response) {
      combined.throwIfAborted();
      size += chunk.length;
      if (size > LIMIT) throw Error("Illustration too large");
      chunks.push(chunk);
    }
  } finally { response.destroy(); }
  const source = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp", "avif"].includes(metadata.format)) throw Error("Invalid illustration");
  const image = await source.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  combined.throwIfAborted();
  const temporary = `${stem}.preview-${randomUUID()}.part`;
  try {
    await writeFile(temporary, image, { flag: "wx", mode: 0o600 });
    await link(temporary, `${stem}.preview.webp`);
  } catch (e) {
    if (e.code === "EEXIST") return "existing";
    throw e;
  } finally { await unlink(temporary).catch(() => {}); }
  return "downloaded";
}
