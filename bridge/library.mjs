import { readFile, writeFile, mkdir, realpath, lstat, rename, link, unlink, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const TRASH = ".comfy-pocket-trash";
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const inside = (base, target) => {
  const rel = path.relative(base, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw fail("Chemin interdit", 403);
  return target;
};
export function library(config, safeFile) {
  let pending = Promise.resolve();
  const serial = fn => { const run = pending.then(fn); pending = run.catch(() => {}); return run; };
  const statePath = path.join(config.stateDir ?? path.dirname(config.roots[0].path), "library.json");
  async function favorites() {
    try { return JSON.parse(await readFile(statePath, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return {}; throw e; }
  }
  async function writeFavorites(data) {
    await mkdir(path.dirname(statePath), { recursive: true });
    const temp = statePath + ".tmp";
    await writeFile(temp, JSON.stringify(data)); await rename(temp, statePath);
  }
  const modelStatePath = path.join(path.dirname(statePath), "model-favorites.json");
  async function modelFavorites() {
    try { return JSON.parse(await readFile(modelStatePath, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return { checkpoints: [], loras: [] }; throw e; }
  }
  async function source(item) {
    const root = config.roots[item.root];
    if (!root || !Number.isInteger(item.root)) throw fail("Dossier inconnu", 404);
    if (item.relative?.split(/[\\/]/).includes(TRASH)) throw fail("Utilisez la restauration de la corbeille", 403);
    return { base: await realpath(root.path), file: await safeFile(root.path, item.relative) };
  }
  async function trashDir(base) {
    const dir = inside(base, path.join(base, TRASH));
    await mkdir(dir, { recursive: true });
    if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== dir) throw fail("Corbeille invalide", 403);
    return dir;
  }
  return {
    modelFavorites,
    modelFavorite: item => serial(async () => {
      if (!["checkpoints", "loras"].includes(item.kind) || typeof item.name !== "string" || !item.name || item.name.length > 1024 || typeof item.favorite !== "boolean") throw fail("Favori de modèle invalide");
      const data = await modelFavorites(), names = new Set(data[item.kind] ?? []);
      if (item.favorite) names.add(item.name); else names.delete(item.name);
      if (names.size > 5000) throw fail("Limite de favoris atteinte");
      data[item.kind] = [...names];
      await mkdir(path.dirname(modelStatePath), { recursive: true });
      await writeFile(modelStatePath + ".tmp", JSON.stringify(data)); await rename(modelStatePath + ".tmp", modelStatePath);
      return data;
    }),
    async decorate(items, resolvedFiles) {
      const marks = await favorites();
      return Promise.all(items.map(async item => {
        const file = resolvedFiles?.get(item) ?? (await source(item)).file;
        return { ...item, favorite: !!marks[file] };
      }));
    },
    favorite: item => serial(async () => {
      const { file } = await source(item), data = await favorites();
      if (typeof item.favorite !== "boolean") throw fail("Favori invalide");
      if (item.favorite) data[file] = true; else delete data[file];
      await writeFavorites(data); return { favorite: !!data[file] };
    }),
    trash: item => serial(async () => {
      const { base, file } = await source(item), dir = await trashDir(base);
      const id = randomUUID(), name = id + path.extname(file), relative = path.relative(base, file);
      const record = { id, root: item.root, relative, name: path.basename(file), deleted: Date.now(), stored: name };
      // Journal first: an interrupted move remains recoverable on the next run.
      await writeFile(inside(dir, path.join(dir, id + ".json")), JSON.stringify(record), { flag: "wx" });
      try { await rename(file, inside(dir, path.join(dir, name))); }
      catch (e) { await unlink(path.join(dir, id + ".json")); throw e; }
      return record;
    }),
    async trashList() {
      const items = [], seen = new Set();
      for (const [root, item] of config.roots.entries()) {
        let base;
        try { base = await realpath(item.path); } catch { continue; }
        if (seen.has(base)) continue; seen.add(base);
        const dir = path.join(base, TRASH);
        try {
          if ((await lstat(dir)).isSymbolicLink()) continue;
          for (const entry of await readdir(dir)) {
            if (!/^[\da-f-]{36}\.json$/.test(entry)) continue;
            const record = JSON.parse(await readFile(inside(dir, path.join(dir, entry)), "utf8"));
            try { await stat(inside(dir, path.resolve(dir, record.stored))); items.push({ ...record, root }); } catch {}
          }
        } catch (e) { if (e.code !== "ENOENT") throw e; }
      }
      return items.sort((a, b) => b.deleted - a.deleted);
    },
    restore: item => serial(async () => {
      if (!/^[\da-f-]{36}$/.test(item.id) || !Number.isInteger(item.root) || !config.roots[item.root]) throw fail("Image inconnue", 404);
      const base = await realpath(config.roots[item.root].path), dir = await trashDir(base);
      const recordPath = inside(dir, path.join(dir, item.id + ".json"));
      const record = JSON.parse(await readFile(recordPath, "utf8"));
      const destination = inside(base, path.resolve(base, record.relative));
      const parent = await realpath(path.dirname(destination));
      if (parent !== base) inside(base, parent);
      const stored = await safeFile(dir, record.stored);
      // A hard link is atomic and fails if the original name is already occupied.
      // Both files are on the same volume. Never overwrite a newer image.
      try { await link(stored, path.join(parent, path.basename(destination))); }
      catch (e) { if (e.code === "EEXIST") throw fail("Une image porte déjà ce nom. Renommez-la sur le PC avant de restaurer.", 409); throw e; }
      await unlink(stored); await unlink(recordPath);
      return { restored: true };
    }),
    async modelInfo(kind, name) {
      const folders = { checkpoints: ["StableDiffusion"], loras: ["Lora", "LyCORIS"] }[kind];
      if (!folders || typeof name !== "string" || !/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(name)) throw fail("Modèle inconnu", 404);
      if (path.isAbsolute(name) || name.includes(":") || name.includes("\0") || name.split(/[\\/]/).includes("..")) throw fail("Modèle interdit", 403);
      const clean = value => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").slice(0, 6000).trim() : "";
      const roots = [...(config.modelsRoot ? folders.map(folder => path.join(config.modelsRoot, folder)) : []), ...(config.modelPaths?.[kind === "upscalers" ? "upscale_models" : kind] ?? [])];
      for (const base of roots) {
        for (const stem of [name.replace(/\.[^.]+$/, ""), name]) for (const suffix of [".cm-info.json", ".civitai.info", ".json"]) {
          let file;
          try { const resolvedBase = await realpath(base); file = inside(resolvedBase, await realpath(path.join(resolvedBase, stem + suffix))); if (!(await stat(file)).isFile()) throw fail("Métadonnées invalides", 403); }
          catch (e) { if (e.code === "ENOENT") continue; throw e; }
          if ((await stat(file)).size > 2 * 1024 ** 2) throw fail("Métadonnées trop volumineuses", 413);
          let data; try { data = JSON.parse(await readFile(file, "utf8")); } catch { throw fail("Métadonnées illisibles", 422); }
          if (!data || typeof data !== "object") throw fail("Métadonnées invalides", 422);
          const words = data.TrainedWords ?? data.trainedWords ?? [];
          return { title: clean(data.UserTitle || data.ModelName || data.model?.name), version: clean(data.VersionName || data.name), baseModel: clean(data.BaseModel || data.baseModel), description: clean(data.VersionDescription || data.ModelDescription || data.description), triggers: Array.isArray(words) ? words.filter(w => typeof w === "string" && w.length <= 200).slice(0, 100) : [], tags: Array.isArray(data.Tags) ? data.Tags.filter(w => typeof w === "string").slice(0, 30).map(clean) : [] };
        }
      }
      return { title: "", version: "", baseModel: "", description: "", triggers: [], tags: [] };
    },
    async preview(kind, name) {
      const folders = { checkpoints: ["StableDiffusion"], loras: ["Lora", "LyCORIS"], vae: ["VAE"], upscalers: ["ESRGAN", "RealESRGAN", "SwinIR"] }[kind];
      if (!folders || typeof name !== "string" || !/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(name)) throw fail("Illustration indisponible", 404);
      if (path.isAbsolute(name) || name.includes(":") || name.includes("\0") || name.split(/[\\/]/).includes("..")) throw fail("Modèle interdit", 403);
      const roots = [...(config.modelsRoot ? folders.map(folder => path.join(config.modelsRoot, folder)) : []), ...(config.modelPaths?.[kind === "upscalers" ? "upscale_models" : kind] ?? [])];
      for (const base of roots) {
        for (const stem of [name.replace(/\.[^.]+$/, ""), name]) {
          for (const ext of ["jpeg", "jpg", "png", "webp"]) {
            try { return await safeFile(base, stem + ".preview." + ext); }
            catch (e) { if (e.status === 403) throw e; if (e.code !== "ENOENT") throw e; }
          }
        }
      }
      throw fail("Illustration indisponible", 404);
    },
  };
}
