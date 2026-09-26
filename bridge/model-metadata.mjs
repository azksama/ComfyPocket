import { readFile, realpath, stat, open } from "node:fs/promises";
import path from "node:path";
import { modelRoots } from "./model-profile.mjs";
import { importError as fail } from "./import-network.mjs";

const folders = {
  checkpoints: ["StableDiffusion"],
  diffusion_models: ["DiffusionModels"],
  loras: ["Lora", "LyCORIS"],
  vae: ["VAE"],
  upscalers: ["ESRGAN", "RealESRGAN", "SwinIR"],
};
export function modelLocations(config, kind, name) {
  if (
    !folders[kind] ||
    typeof name !== "string" ||
    name.length > 1024 ||
    !/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(name)
  )
    throw fail("Modèle inconnu", 404);
  if (
    path.isAbsolute(name) ||
    /[:\0]/.test(name) ||
    name.split(/[\\/]/).includes("..")
  )
    throw fail("Modèle interdit", 403);
  return [
    ...new Set([
      ...modelRoots(config, kind, folders[kind]),
      ...(kind === "checkpoints"
        ? modelRoots(config, "diffusion_models", folders.diffusion_models)
        : []),
    ]),
  ];
}
export async function containedModelFile(root, name) {
  const base = await realpath(root),
    file = await realpath(path.join(base, name));
  const relative = path.relative(base, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw fail("Modèle interdit", 403);
  const info = await stat(file);
  if (!info.isFile()) throw fail("Métadonnées invalides", 403);
  return { file, info };
}
const clean = (value) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .slice(0, 6000)
        .trim()
    : "";
const empty = () => ({
  title: "",
  version: "",
  baseModel: "",
  description: "",
  triggers: [],
  tags: [],
});
export function createModelMetadata(config) {
  const cache = new Map();
  return async function modelInfo(kind, name) {
    const roots = modelLocations(config, kind, name);
    for (const root of roots) {
      for (const stem of [name.replace(/\.[^.]+$/, ""), name])
        for (const suffix of [".cm-info.json", ".civitai.info", ".json"]) {
          let resolved;
          try {
            resolved = await containedModelFile(root, stem + suffix);
          } catch (e) {
            if (e.code === "ENOENT") continue;
            throw e;
          }
          const { file, info } = resolved;
          if (info.size > 2 * 1024 ** 2)
            throw fail("Métadonnées trop volumineuses", 413);
          const stamp = `${info.mtimeMs}:${info.size}`;
          if (cache.get(file)?.stamp === stamp) return cache.get(file).value;
          let data;
          try {
            data = JSON.parse(
              (await readFile(file, "utf8")).replace(/^\uFEFF/, ""),
            );
          } catch {
            throw fail("Métadonnées illisibles", 422);
          }
          if (!data || typeof data !== "object")
            throw fail("Métadonnées invalides", 422);
          const words = data.TrainedWords ?? data.trainedWords ?? [];
          const value = {
            title: clean(data.UserTitle || data.ModelName || data.model?.name),
            version: clean(data.VersionName || data.name),
            baseModel: clean(data.BaseModel || data.baseModel),
            description: clean(
              data.VersionDescription ||
                data.ModelDescription ||
                data.description,
            ),
            triggers: Array.isArray(words)
              ? words
                  .filter((w) => typeof w === "string" && w.length <= 200)
                  .slice(0, 100)
              : [],
            tags: Array.isArray(data.Tags)
              ? data.Tags.filter((w) => typeof w === "string")
                  .slice(0, 30)
                  .map(clean)
              : [],
          };
          if (cache.size >= 5000) cache.delete(cache.keys().next().value);
          cache.set(file, { stamp, value });
          return value;
        }
    }
    // Safetensors training metadata is a fallback, never the filename alone.
    if (name.toLowerCase().endsWith(".safetensors"))
      for (const root of roots) {
        let handle;
        try {
          const { file } = await containedModelFile(root, name);
          handle = await open(file, "r");
          const prefix = Buffer.alloc(8);
          if ((await handle.read(prefix, 0, 8, 0)).bytesRead !== 8) continue;
          const length = Number(prefix.readBigUInt64LE());
          if (length < 2 || length > 8 * 1024 ** 2) continue;
          const header = Buffer.alloc(length);
          if ((await handle.read(header, 0, length, 8)).bytesRead !== length)
            continue;
          const m = JSON.parse(header.toString("utf8")).__metadata__ || {};
          return {
            ...empty(),
            baseModel: clean(
              m.modelspec?.architecture ||
                m["modelspec.architecture"] ||
                m.ss_base_model_version,
            ),
          };
        } catch (e) {
          if (e.status === 403) throw e;
        } finally {
          await handle?.close();
        }
      }
    return empty();
  };
}
