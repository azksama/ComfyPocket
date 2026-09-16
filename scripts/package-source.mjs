import { cp, mkdir, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const root = process.cwd(),
  stage = path.join(await mkdtemp(path.resolve("../../work/source-package-v5-")), "ComfyPocket");
const excluded = new Set([
  "node_modules",
  "target",
  "dist",
  ".gradle",
  ".cxx",
  ".kotlin",
  ".tauri",
  ".idea",
  "build",
  "jniLibs",
  ".bridge",
  "test-results",
  "playwright-report",
  ".git",
  "local.properties",
]);
await mkdir(stage, { recursive: true });
await cp(root, stage, {
  recursive: true,
  filter: (p) =>
    !path
      .relative(root, p)
      .split(path.sep)
      .some(
        (s) =>
          excluded.has(s) ||
          s.endsWith(".tsbuildinfo") ||
          s.endsWith(".apk") ||
          /\.(?:jks|keystore|pem|key|pfx|p12)$/.test(s) ||
          /^(?:pairing|Appairage).*\.json$/i.test(s) ||
          s === ".env" || s.startsWith(".env."),
      ),
});
execFileSync(
  "tar",
  [
    "-a",
    "-c",
    "-f",
    path.resolve("../ComfyPocket-sources.zip"),
    "-C",
    path.dirname(stage),
    "ComfyPocket",
  ],
  { stdio: "inherit" },
);
console.log(
  "Sources packaged without dependencies, build artifacts or pairing secrets.",
);
