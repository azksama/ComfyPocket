import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "assets/brand/mochi.png");
execFileSync(
  process.execPath,
  [path.join(root, "node_modules/@tauri-apps/cli/tauri.js"), "icon", source],
  { cwd: root, stdio: "inherit" },
);
await sharp(source)
  .resize(640)
  .webp({ quality: 90 })
  .toFile(path.join(root, "assets/brand/mochi.webp"));
const archive = path.join(root, "assets/android-icons");
const manifest = [];
for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  await mkdir(path.join(archive, density), { recursive: true });
  for (const file of ["ic_launcher.png", "ic_launcher_round.png"]) {
    const resource = `src-tauri/gen/android/app/src/main/res/mipmap-${density}/${file}`;
    const data = await readFile(path.join(root, resource));
    const metadata = await sharp(data).metadata();
    await copyFile(
      path.join(root, resource),
      path.join(archive, density, file),
    );
    manifest.push({
      file: `${density}/${file}`,
      size: metadata.width,
      resource,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
  }
}
const store = "assets/android-icons/play_store_512.png";
await sharp(source).resize(512).png().toFile(path.join(root, store));
manifest.push({
  file: "play_store_512.png",
  size: 512,
  resource: store,
  sha256: createHash("sha256")
    .update(await readFile(path.join(root, store)))
    .digest("hex"),
});
await writeFile(
  path.join(archive, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
