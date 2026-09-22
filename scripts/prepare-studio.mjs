import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtime = path.join(root, "launcher/src-tauri/runtime");
await mkdir(runtime, { recursive: true });
await cp(path.join(root, "bridge"), path.join(runtime, "bridge"), {
  recursive: true,
  filter: (p) => !p.endsWith(".test.mjs"),
});
await mkdir(path.join(runtime, "scripts"), { recursive: true });
for (const file of [
  "Start-ComfyPocket.ps1",
  "CompanionProcess.ps1",
  "Studio-Control.ps1",
  "Studio-Firewall.ps1",
])
  await cp(
    path.join(root, "scripts", file),
    path.join(runtime, "scripts", file),
  );
const runtimeNode = path.join(runtime, "node.exe");
const currentNode = await readFile(process.execPath);
const bundledNode = await readFile(runtimeNode).catch(() => null);
if (!bundledNode?.equals(currentNode)) await cp(process.execPath, runtimeNode);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await writeFile(
  path.join(runtime, "package.json"),
  JSON.stringify(
    {
      name: "mochi-studio-runtime",
      version: "0.1.0",
      private: true,
      type: "module",
      dependencies: Object.fromEntries(
        ["ws", "sharp", "selfsigned", "exifr"].map((k) => [
          k,
          pkg.dependencies[k],
        ]),
      ),
    },
    null,
    2,
  ),
);
execFileSync(
  process.execPath,
  [
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    ),
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
  ],
  { cwd: runtime, stdio: "inherit" },
);
console.log("Runtime autonome préparé.");
