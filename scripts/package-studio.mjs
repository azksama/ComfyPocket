import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const version = JSON.parse(
  await readFile(path.join(root, "launcher/package.json"), "utf8"),
).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Invalid Studio version");
const release = path.join(root, "launcher/src-tauri/target/release");
const output = path.join(root, "..");
const stagingRoot = path.resolve(root, "../../work");
await mkdir(stagingRoot, { recursive: true });
const staging = await mkdtemp(path.join(stagingRoot, "studio-portable-"));
const name = `Mochi-Studio-${version}-Portable-Windows-x64`;
const stage = path.join(staging, name);
await mkdir(stage);
await cp(
  path.join(release, "mochi-studio.exe"),
  path.join(stage, "Mochi Studio.exe"),
);
await cp(path.join(release, "runtime"), path.join(stage, "runtime"), {
  recursive: true,
});
await writeFile(
  path.join(stage, "Lisez-moi.txt"),
  `Mochi Studio ${version}\n\nExtraire toute cette archive dans un dossier, puis ouvrir Mochi Studio.exe.\nLe dossier runtime doit rester à côté du programme.\n\nVos réglages et appairages sont conservés dans %USERPROFILE%\\.mochi\\pc.\nLa version portable et la version installée retrouvent les mêmes données sur ce PC.\nLes anciennes données AppData sont reprises au premier lancement et conservées.\n\nActiver le partage public dans Paramètres, puis démarrer le moteur.\nLa redirection du port sur votre routeur reste nécessaire pour un accès extérieur.\n`,
);
const archive = path.join(staging, `${name}.zip`);
execFileSync("tar", ["-a", "-c", "-f", archive, "-C", staging, name], {
  stdio: "inherit",
});
await rename(archive, path.join(output, `${name}.zip`));
await cp(
  path.join(release, "bundle/nsis", `Mochi Studio_${version}_x64-setup.exe`),
  path.join(output, `Mochi-Studio-${version}-Windows-x64.exe`),
);
console.log(
  JSON.stringify({
    version,
    stage,
    portable: path.join(output, `${name}.zip`),
  }),
);
