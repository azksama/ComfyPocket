import { cp, lstat, mkdir, mkdtemp, readFile, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  "jnilibs",
  ".bridge",
  "test-results",
  "playwright-report",
  ".git",
  ".codex",
  "work",
  "signing",
  "secrets",
  ".secrets",
  "comfypocketpc",
  "local.properties",
  "key.properties",
  "keystore.properties",
  "credentials.json",
  "credentials.properties",
  "password.txt",
  "passwords.txt",
  "token.txt",
  "tokens.json",
  ".npmrc",
  ".netrc",
]);

export function includeSource(relative) {
  return !relative.split(/[\\/]/).some((part) => {
    const name = part.toLowerCase();
    // Strip editor/backup suffixes before checking credential filenames.
    const original = name.replace(/(?:\.(?:bak|backup|old|orig|tmp)|~)+$/, "");
    return (
      excluded.has(name) ||
      excluded.has(original) ||
      /\.(?:tsbuildinfo|apk|aab|idsig|jks|keystore|pem|key|pfx|p12|log|zip|safetensors|ckpt|gguf|pth|pt|bin|so|dll|exe|class)$/.test(
        original,
      ) ||
      /^(?:pairing|appairage).*\.json(?:\..*)?$/.test(name) ||
      name === ".env" ||
      name.startsWith(".env.")
    );
  });
}

export async function packageSource({
  root = process.cwd(),
  output,
  stagingDirectory,
} = {}) {
  root = path.resolve(root);
  output = path.resolve(
    output ?? path.join(root, "../Mochi-sources.zip"),
  );
  stagingDirectory = path.resolve(
    stagingDirectory ?? path.join(root, "../../work"),
  );
  const relativeStage = path.relative(root, stagingDirectory);
  if (
    !relativeStage ||
    (!relativeStage.startsWith(".." + path.sep) &&
      relativeStage !== ".." &&
      !path.isAbsolute(relativeStage))
  ) {
    throw new Error("Le dossier temporaire doit être situé hors des sources.");
  }
  const { version } = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8"),
  );
  if (
    typeof version !== "string" ||
    version.length > 80 ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)
  ) {
    throw new Error("Version du projet invalide.");
  }
  await mkdir(stagingDirectory, { recursive: true });
  const stagingRoot = await mkdtemp(
    path.join(stagingDirectory, `source-package-v${version}-`),
  );
  const stage = path.join(stagingRoot, "ComfyPocket");
  await cp(root, stage, {
    recursive: true,
    filter: async (file) =>
      includeSource(path.relative(root, file)) &&
      !(await lstat(file)).isSymbolicLink(),
  });
  await mkdir(path.dirname(output), { recursive: true });
  const archive = path.join(stagingRoot, "Mochi-sources.zip");
  execFileSync(
    "tar",
    ["-a", "-c", "-f", archive, "-C", stagingRoot, "ComfyPocket"],
    { stdio: "inherit" },
  );
  await rename(archive, output);
  return { output, stage, version };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { version } = await packageSource();
  console.log(
    `Sources ${version} packaged without credentials, runtime state, dependencies or build artifacts.`,
  );
}
