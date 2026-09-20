import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import sharp from "sharp";
import path from "node:path";
const app = path.resolve(import.meta.dirname, "..");
const apk = await readFile(path.join(app, "../Mochi-arm64.apk"));
const pngs = unzipSync(apk, { filter: file => file.name.endsWith(".png") });
const digest = data => createHash("sha256").update(data).digest("hex");
async function pixels(data) { const image = sharp(data); const m = await image.metadata(); return `${m.width}x${m.height}:` + digest(await image.ensureAlpha().raw().toBuffer()); }
const entries = await Promise.all(Object.entries(pngs).map(async ([file, data]) => [file, await pixels(data)]));
const manifest = JSON.parse(await readFile(path.join(app, "assets/android-icons/manifest.json"), "utf8"));
const results = [];
for (const icon of manifest.filter(v => v.resource && v.size <= 192)) {
  const source = await readFile(path.join(app, icon.resource));
  if (digest(source) !== icon.sha256) throw Error("Original resource modified: " + icon.file);
  const signature = await pixels(source), match = entries.find(([, value]) => value === signature);
  if (!match) throw Error("Icon pixels missing in APK: " + icon.file);
  results.push({ supplied: icon.file, size: icon.size, apkResource: match[0], exactSourceBytes: true, decodedPixelsPreserved: true });
}
if (results.length !== 10) throw Error("Expected all 10 density icons");
await writeFile(path.join(app, "../verification/v0.7/apk-icons.json"), JSON.stringify({ apkSha256: digest(apk), icons: results }, null, 2));
console.log("Les 10 icônes Android fournies sont présentes dans l'APK, pixels identiques.");
