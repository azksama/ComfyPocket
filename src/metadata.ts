import exifr from "exifr";
import { Unzlib } from "fflate";
import { defaults, losslessJson, normalizeSettings, parseWorkflow, type Settings } from "./workflow";
import type { Workflow } from "./api";

export interface Imported { settings: Partial<Settings>; workflow?: Workflow; source: string; warnings: string[] }
const MAX = 8 * 1024 * 1024;
const utf8 = new TextDecoder();
const decode = (bytes: Uint8Array) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("latin1").decode(bytes); }
};
function inflate(bytes: Uint8Array) {
  const parts: Uint8Array[] = []; let size = 0;
  const z = new Unzlib(chunk => {
    size += chunk.length;
    if (size > MAX) throw new Error("Métadonnées trop volumineuses.");
    parts.push(chunk);
  });
  for (let p = 0; p < bytes.length; p += 256) z.push(bytes.subarray(p, p + 256), p + 256 >= bytes.length);
  const all = new Uint8Array(size); let p = 0;
  for (const part of parts) { all.set(part, p); p += part.length; }
  return all;
}
export function pngTags(bytes: Uint8Array): Record<string, string> {
  const tags: Record<string, string> = {};
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let total = 0;
  for (let p = 8; p + 12 <= bytes.length;) {
    const length = dv.getUint32(p), type = utf8.decode(bytes.subarray(p + 4, p + 8));
    if (length > bytes.length - p - 12) throw new Error("PNG tronqué.");
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      if (length > MAX) throw new Error("Métadonnées trop volumineuses.");
      const data = bytes.subarray(p + 8, p + 8 + length), end = data.indexOf(0);
      if (end > 0 && end <= 79) {
        const key = utf8.decode(data.subarray(0, end)); let value: Uint8Array;
        if (type === "tEXt") value = data.subarray(end + 1);
        else if (type === "zTXt") {
          if (data[end + 1] !== 0) throw new Error("Compression PNG inconnue.");
          value = inflate(data.subarray(end + 2));
        } else {
          const language = data.indexOf(0, end + 3), translated = data.indexOf(0, language + 1);
          if (language < 0 || translated < 0 || data[end + 2] !== 0) throw new Error("Métadonnées PNG invalides.");
          value = data[end + 1] === 1 ? inflate(data.subarray(translated + 1)) : data.subarray(translated + 1);
        }
        total += value.length;
        if (total > MAX) throw new Error("Métadonnées trop volumineuses.");
        tags[key] = decode(value);
      }
    }
    p += length + 12;
    if (type === "IEND") break;
  }
  return tags;
}
export function commentText(value: unknown): string {
  if (typeof value === "string") return value.replace(/^(ASCII|UNICODE)\0*/, "").replace(/\0+$/, "");
  if (!(value instanceof Uint8Array) && !Array.isArray(value)) return "";
  const bytes = new Uint8Array(value as number[]), header = utf8.decode(bytes.subarray(0, 8));
  if (header.startsWith("UNICODE")) {
    const b = bytes.subarray(8);
    const little = b[0] === 255 && b[1] === 254 || b[1] === 0 && b[0] !== 0;
    return new TextDecoder(little ? "utf-16le" : "utf-16be").decode(b).replace(/\0+$/, "");
  }
  return decode(header.startsWith("ASCII") ? bytes.subarray(8) : bytes).replace(/\0+$/, "");
}
export async function importImage(bytes: Uint8Array): Promise<Imported> {
  if (bytes.length > 64 * 1024 * 1024) throw new Error("Image supérieure à 64 Mo.");
  let tags: Record<string, string> = {};
  if (bytes[0] === 137 && utf8.decode(bytes.subarray(1, 4)) === "PNG") tags = pngTags(bytes);
  else if (bytes[0] === 255 && bytes[1] === 216) {
    const exif = await exifr.parse(bytes, { userComment: true, pick: ["UserComment", "ImageDescription", "XPComment"], reviveValues: false });
    tags.parameters = commentText(exif?.UserComment ?? exif?.userComment) || commentText(exif?.ImageDescription) || commentText(exif?.XPComment);
  } else throw new Error("Import des paramètres : choisissez une image PNG ou JPEG.");
  return parseTags(tags);
}
export function samplerName(text: string) {
  const scheduler = /karras/i.test(text) ? "karras" : /exponential/i.test(text) ? "exponential" : "normal";
  const raw = text.replace(/\s+(Karras|Exponential)$/i, "").trim().toLowerCase();
  const map: Record<string, string> = { "euler a": "euler_ancestral", "euler ancestral": "euler_ancestral", "dpm++ 2m": "dpmpp_2m", "dpm++ 2m sde": "dpmpp_2m_sde", "dpm++ 3m sde": "dpmpp_3m_sde", "dpm++ sde": "dpmpp_sde", "dpm++ 2s a": "dpmpp_2s_ancestral", "dpm2 a": "dpm_2_ancestral", "dpm2": "dpm_2", "dpm fast": "dpm_fast", "dpm adaptive": "dpm_adaptive" };
  return { sampler: map[raw] ?? raw.replace(/ /g, "_"), scheduler };
}
function a1111(text: string, warnings: string[]): Partial<Settings> {
  const match = /(?:^|\n)Steps:\s*\d+/.exec(text);
  if (!match) throw new Error("Aucun paramètre de génération reconnu dans cette image.");
  const before = text.slice(0, match.index).trim(), negative = before.indexOf("Negative prompt:");
  const fields = Object.fromEntries([...text.slice(match.index).matchAll(/(?:^|,|\n)\s*([\w .-]+):\s*("(?:[^"\\]|\\.)*"|[^,\n]*)/g)].map(m => [m[1].trim(), m[2].replace(/^"|"$/g, "").trim()]));
  const s: Partial<Settings> = { positive: (negative < 0 ? before : before.slice(0, negative)).trim(), negative: negative < 0 ? "" : before.slice(negative + 16).trim() };
  const numeric = (key: keyof Settings, field: string) => { if (fields[field] !== undefined && Number.isFinite(Number(fields[field]))) (s as any)[key] = Number(fields[field]); };
  numeric("steps", "Steps"); numeric("cfg", "CFG scale"); numeric("clipSkip", "Clip skip"); numeric("batch", "Batch size");
  if (fields.Seed) s.seed = fields.Seed;
  if (fields.Model) s.model = fields.Model;
  if (fields.VAE) s.vae = fields.VAE;
  if (fields.Sampler) Object.assign(s, samplerName(fields.Sampler));
  if (fields["Schedule type"]) s.scheduler = fields["Schedule type"].toLowerCase();
  const size = fields.Size?.match(/(\d+)\s*x\s*(\d+)/i);
  if (size) { s.width = Number(size[1]); s.height = Number(size[2]); }
  if (fields["Hires upscale"] || fields["Hires steps"]) {
    const method = fields["Hires upscaler"] ?? "Latent (nearest-exact)";
    let mapped = /latent|nearest/i.test(method) ? "nearest-exact" : "model:" + method;
    if (/^Latent\s*\(bicubic\)$/i.test(method)) mapped = "bicubic";
    else if (mapped === "nearest-exact" && !/^(?:Latent\s*\(nearest-exact\)|nearest-exact)$/i.test(method)) {
      warnings.push(`Hires Fix « ${method} » n’a pas d’équivalent exact reconnu. La méthode nearest-exact est proposée ; vérifiez ce réglage avant de générer.`);
    }
    s.hires = { ...defaults.hires, enabled: true, scale: Number(fields["Hires upscale"] ?? 2), steps: Number(fields["Hires steps"] ?? s.steps), denoise: Number(fields["Denoising strength"] ?? 0.7), method: mapped };
  }
  const loras = [...(s.positive ?? "").matchAll(/<(?:lora|lyco):([^:>]+):(-?[\d.]+)>/gi)];
  if (loras.length) { s.loras = loras.map(m => ({ name: m[1], strength: Number(m[2]) })); s.positive = s.positive?.replace(/<(?:lora|lyco):[^>]+>/gi, "").trim(); }
  return s;
}
function graphSettings(w: Workflow): Partial<Settings> {
  const visited = new Set<string>(), ordered: typeof w[string][] = [];
  const visit = (id: string) => {
    if (visited.has(id) || !w[id]) return; visited.add(id);
    for (const v of Object.values(w[id].inputs)) if (Array.isArray(v) && v.length === 2 && typeof v[0] === "string") visit(v[0]);
    ordered.push(w[id]);
  };
  const saves = Object.entries(w).filter(([, n]) => /SaveImage|PreviewImage/.test(n.class_type));
  if (saves.length) visit(saves[0][0]); else Object.keys(w).forEach(visit);
  const of = (type: string) => ordered.filter(n => n.class_type === type).map(n => n.inputs);
  const first = (type: string) => of(type)[0];
  const samplers = of("KSampler"), sampler = samplers[0] ?? first("KSamplerAdvanced");
  const text = (ref: unknown, seen = new Set<string>()): string => {
    if (!Array.isArray(ref) || seen.has(ref[0])) return ""; seen.add(ref[0]);
    const node = w[ref[0]]?.inputs;
    if (!node) return "";
    if (typeof node.text === "string") return node.text;
    if (typeof node.text_g === "string") return node.text_g;
    return Object.values(node).filter(Array.isArray).map(r => text(r, seen)).filter(Boolean).join("\n");
  };
  const s: Partial<Settings> = {};
  if (sampler) {
    s.seed = String(sampler.seed ?? sampler.noise_seed ?? "");
    for (const key of ["steps", "cfg"] as const) if (typeof sampler[key] === "number") s[key] = sampler[key];
    s.sampler = String(sampler.sampler_name); s.scheduler = String(sampler.scheduler);
    s.positive = text(sampler.positive); s.negative = text(sampler.negative);
  }
  const ckpt = first("CheckpointLoaderSimple") ?? first("CheckpointLoader");
  if (ckpt) s.model = String(ckpt.ckpt_name);
  const latent = first("EmptyLatentImage") ?? first("EmptySD3LatentImage");
  if (latent) { s.width = Number(latent.width); s.height = Number(latent.height); s.batch = Number(latent.batch_size); }
  s.loras = of("LoraLoader").map(l => ({ name: String(l.lora_name), strength: Number(l.strength_model) }));
  if (first("VAELoader")) s.vae = String(first("VAELoader").vae_name);
  if (first("CLIPSetLastLayer")) s.clipSkip = Math.abs(Number(first("CLIPSetLastLayer").stop_at_clip_layer));
  const up = first("LatentUpscale") ?? first("LatentUpscaleBy");
  if (up && samplers.length > 1) s.hires = { enabled: true, method: String(up.upscale_method), scale: Number(up.scale_by ?? Number(up.width) / Number(s.width)), steps: Number(samplers[1].steps), denoise: Number(samplers[1].denoise) };
  const finalUp = of("ImageScaleBy").at(-1);
  if (finalUp) s.upscale = { enabled: true, method: String(finalUp.upscale_method), scale: Number(finalUp.scale_by) };
  return s;
}
export function parseTags(tags: Record<string, string>): Imported {
  let workflow: Workflow | undefined;
  try { if (tags.prompt) workflow = parseWorkflow(tags.prompt); } catch {}
  if (tags.comfy_pocket) {
    const saved = losslessJson(tags.comfy_pocket);
    if (saved?.settings && typeof saved.settings === "object") return { settings: saved.settings, workflow, source: "Comfy Pocket", warnings: [] };
  }
  if (tags["parameters-json"]) {
    const p = losslessJson(tags["parameters-json"]), settings: Partial<Settings> = {};
    const fields = { PositivePrompt: "positive", NegativePrompt: "negative", Steps: "steps", CfgScale: "cfg", Width: "width", Height: "height", ModelName: "model" };
    for (const [from, to] of Object.entries(fields)) if (p[from] != null) (settings as any)[to] = p[from];
    if (p.Seed != null) settings.seed = String(p.Seed);
    if (p.Sampler) Object.assign(settings, samplerName(p.Sampler));
    if (workflow) Object.assign(settings, graphSettings(workflow));
    return { settings, workflow, source: "Stability Matrix", warnings: ["Les extensions propres au workflow restent disponibles dans le workflow API original."] };
  }
  if (workflow) return { settings: graphSettings(workflow), workflow, source: "ComfyUI", warnings: ["Réglages reconnus chargés. Utilisez le workflow API original pour conserver les nœuds personnalisés."] };
  const raw = tags.parameters || tags.user_comment || "";
  const warnings: string[] = [];
  return { settings: a1111(raw, warnings), source: "Paramètres PNG / EXIF", warnings };
}
export function resolveImport(result: Imported, catalogs: { models: string[]; loras: string[]; vaes: string[]; samplers: string[]; schedulers: string[] }): Imported {
  const warnings = [...result.warnings];
  const match = (value: string, list: string[], label: string) => {
    if (list.includes(value)) return value;
    const stem = (s: string) => s.split(/[\\/]/).pop()!.replace(/\.(safetensors|ckpt|pt|pth)$/i, "").toLowerCase();
    const hits = list.filter(v => stem(v) === stem(value));
    if (hits.length === 1) return hits[0];
    warnings.push(`${label} absent ou ambigu sur ce PC : ${value}`); return value;
  };
  const s = normalizeSettings(result.settings);
  if (s.model) s.model = match(s.model, catalogs.models, "Modèle"); else warnings.push("Modèle non retrouvé : sélectionnez-le avant de générer.");
  s.loras = s.loras.map(l => ({ ...l, name: match(l.name, catalogs.loras, "LoRA") }));
  if (s.vae) s.vae = match(s.vae, catalogs.vaes, "VAE");
  if (!catalogs.samplers.includes(s.sampler)) warnings.push(`Sampler absent : ${s.sampler}`);
  if (!catalogs.schedulers.includes(s.scheduler)) warnings.push(`Scheduler absent : ${s.scheduler}`);
  if (!s.seed) warnings.push("Aucune seed dans cette image. La seed reste aléatoire.");
  s.batches = 1;
  return { ...result, settings: s, warnings };
}
