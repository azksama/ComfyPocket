import type { Workflow, ObjectInfo } from "./api";
import { parse as parseLossless } from "lossless-json";

export interface Settings {
  model: string; positive: string; negative: string;
  width: number; height: number; steps: number; cfg: number;
  seed: string; sampler: string; scheduler: string; batch: number; batches: number;
  loras: { name: string; strength: number }[];
  vae: string; clipSkip: number;
  hires: { enabled: boolean; method: string; scale: number; steps: number; denoise: number };
  upscale: { enabled: boolean; method: string; scale: number };
}
export const defaults: Settings = {
  model: "", positive: "", negative: "", width: 1024, height: 1024,
  steps: 30, cfg: 5, seed: "", sampler: "euler_ancestral", scheduler: "normal",
  batch: 1, batches: 1, loras: [], vae: "", clipSkip: 1,
  hires: { enabled: false, method: "nearest-exact", scale: 2, steps: 20, denoise: 0.7 },
  upscale: { enabled: false, method: "nearest-exact", scale: 2 },
};
export function normalizeSettings(s: Partial<Settings>): Settings {
  const result = structuredClone(defaults);
  if (!s || typeof s !== "object") return result;
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    if (typeof s[key] === typeof defaults[key] && typeof s[key] !== "object") (result as any)[key] = s[key];
  }
  if (typeof s.seed === "number") result.seed = String(s.seed);
  if (Array.isArray(s.loras)) result.loras = s.loras.filter(l => l && typeof l.name === "string" && typeof l.strength === "number").map(l => ({ name: l.name, strength: l.strength }));
  for (const kind of ["hires", "upscale"] as const) {
    for (const key of Object.keys(defaults[kind])) {
      const val = (s[kind] as any)?.[key];
      if (typeof val === typeof (defaults[kind] as any)[key]) (result[kind] as any)[key] = val;
    }
  }
  return result;
}
export const MAX_SEED = 18446744073709551615n;
export function seedValue(value: string): number | string {
  const text = value.trim() || String(crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!/^\d+$/.test(text) || BigInt(text) > MAX_SEED) throw new Error("Seed : entier de 0 à 18446744073709551615.");
  // ComfyUI converts INT inputs with int(value); decimal strings preserve all 64 bits.
  const n = BigInt(text);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString();
}
export function losslessJson(text: string): any {
  return parseLossless(text, undefined, value => {
    const n = Number(value);
    return /^-?\d+$/.test(value) && !Number.isSafeInteger(n) ? value : n;
  });
}
export function buildWorkflow(s: Settings): { workflow: Workflow; seed: number | string } {
  if (!s.model) throw new Error("Choisissez un modèle.");
  if (!s.positive.trim()) throw new Error("Décrivez l’image souhaitée.");
  for (const v of [s.width, s.height])
    if (!Number.isInteger(v) || v < 64 || v > 4096 || v % 8) throw new Error("Dimensions : multiples de 8, entre 64 et 4096.");
  const integer = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  const range = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  if (!integer(s.steps, 1, 150) || !range(s.cfg, 0, 30) || !integer(s.batch, 1, 8) || !integer(s.batches, 1, 20) || !integer(s.clipSkip, 1, 24))
    throw new Error("Paramètres de génération invalides.");
  if (s.hires.enabled && (!range(s.hires.scale, 1, 4) || !integer(s.hires.steps, 1, 150) || !range(s.hires.denoise, 0, 1))) throw new Error("Réglages Hires Fix invalides.");
  if (s.upscale.enabled && !range(s.upscale.scale, 1, 4)) throw new Error("Facteur d’agrandissement : 1 à 4.");
  const scale = (s.hires.enabled ? s.hires.scale : 1) * (s.upscale.enabled ? s.upscale.scale : 1);
  const highWidth = Math.round(s.width * s.hires.scale / 8) * 8, highHeight = Math.round(s.height * s.hires.scale / 8) * 8;
  const finalScale = s.upscale.enabled ? s.upscale.scale : 1;
  const finalWidth = Math.round((s.hires.enabled ? highWidth : s.width) * finalScale);
  const finalHeight = Math.round((s.hires.enabled ? highHeight : s.height) * finalScale);
  if (s.width * scale > 16384 || s.height * scale > 16384 || finalWidth > 16384 || finalHeight > 16384) throw new Error("Image finale limitée à 16 384 pixels par côté.");
  const seed = seedValue(s.seed);
  const w: Workflow = { "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: s.model } } };
  type Ref = [string, number];
  let model: Ref = ["1", 0], clip: Ref = ["1", 1], vae: Ref = ["1", 2];
  let next = 20;
  const add = (class_type: string, inputs: Record<string, unknown>): Ref => {
    const id = String(next++); w[id] = { class_type, inputs }; return [id, 0];
  };
  s.loras.forEach(l => {
    if (!l.name || !range(l.strength, -4, 4)) throw new Error("LoRA invalide.");
    model = add("LoraLoader", { model, clip, lora_name: l.name, strength_model: l.strength, strength_clip: l.strength });
    clip = [model[0], 1];
  });
  if (s.clipSkip > 1) clip = add("CLIPSetLastLayer", { clip, stop_at_clip_layer: -s.clipSkip });
  if (s.vae) vae = add("VAELoader", { vae_name: s.vae });
  w["2"] = { class_type: "CLIPTextEncode", inputs: { text: s.positive, clip } };
  w["3"] = { class_type: "CLIPTextEncode", inputs: { text: s.negative, clip } };
  w["4"] = { class_type: "EmptyLatentImage", inputs: { width: s.width, height: s.height, batch_size: s.batch } };
  const sampler = { model, positive: ["2", 0], negative: ["3", 0], seed, steps: s.steps, cfg: s.cfg, sampler_name: s.sampler, scheduler: s.scheduler, denoise: 1 };
  w["5"] = { class_type: "KSampler", inputs: { ...sampler, latent_image: ["4", 0] } };
  let samples: Ref = ["5", 0];
  const scaledImage = (image: Ref, method: string, by: number, width: number, height: number): Ref => {
    if (method.startsWith("model:")) {
      const upscale_model = add("UpscaleModelLoader", { model_name: method.slice(6) });
      const big = add("ImageUpscaleWithModel", { image, upscale_model });
      return add("ImageScale", { image: big, upscale_method: "lanczos", width, height, crop: "disabled" });
    }
    return add("ImageScaleBy", { image, upscale_method: method, scale_by: by });
  };
  if (s.hires.enabled) {
    if (s.hires.method.startsWith("model:")) {
      const decoded = add("VAEDecode", { samples, vae });
      const image = scaledImage(decoded, s.hires.method, s.hires.scale, highWidth, highHeight);
      samples = add("VAEEncode", { pixels: image, vae });
    } else {
      samples = add("LatentUpscale", { samples, upscale_method: s.hires.method, width: highWidth, height: highHeight, crop: "disabled" });
    }
    samples = add("KSampler", { ...sampler, latent_image: samples, steps: s.hires.steps, denoise: s.hires.denoise });
  }
  w["6"] = { class_type: "VAEDecode", inputs: { samples, vae } };
  let image: Ref = ["6", 0];
  if (s.upscale.enabled) image = scaledImage(image, s.upscale.method, s.upscale.scale, finalWidth, finalHeight);
  w["7"] = { class_type: "SaveImage", inputs: { images: image, filename_prefix: "ComfyPocket/ComfyPocket" } };
  return { workflow: w, seed };
}
export function parseWorkflow(text: string): Workflow {
  const json = losslessJson(text), graph = json?.prompt ?? json;
  if (!graph || typeof graph !== "object" || Array.isArray(graph) || !Object.keys(graph).length || Object.keys(graph).length > 2000)
    throw new Error("Workflow API vide ou invalide.");
  for (const node of Object.values(graph) as any[])
    if (!node || typeof node.class_type !== "string" || !node.inputs || typeof node.inputs !== "object" || Array.isArray(node.inputs))
      throw new Error("Importez le format API de ComfyUI, pas le JSON de l’éditeur visuel.");
  return graph;
}
export function checkWorkflow(w: Workflow, info: ObjectInfo) {
  const missing = [...new Set(Object.values(w).filter(n => !info[n.class_type]).map(n => n.class_type))];
  if (missing.length) throw new Error(`Nœuds absents du PC : ${missing.join(", ")}`);
  for (const node of Object.values(w)) {
    if (node.class_type !== "LatentUpscale" || node.inputs.upscale_method !== "bicubic") continue;
    const definition = info.LatentUpscale?.input?.required?.upscale_method;
    const methods = definition?.[0] === "COMBO" ? (definition[1] as { options?: unknown })?.options : definition?.[0];
    if (Array.isArray(methods) && !methods.includes("bicubic")) {
      throw new Error("L’agrandissement latent bicubique importé n’est pas disponible sur ce PC. Choisissez explicitement une autre méthode Hires Fix.");
    }
  }
}
