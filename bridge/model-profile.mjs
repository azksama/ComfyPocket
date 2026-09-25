import { open } from "node:fs/promises";
import path from "node:path";

export function modelRoots(config, kind, folders) {
  const category = kind === "upscalers" ? "upscale_models" : kind;
  const comfy = config.comfyDirectory || (path.basename(config.roots[0].path).toLowerCase() === "output" ? path.dirname(config.roots[0].path) : null);
  return [...new Set([
    ...(config.modelsRoot ? folders.map(f => path.join(config.modelsRoot, f)) : []),
    ...(config.modelPaths?.[category] ?? []),
    ...(comfy ? [path.join(comfy, "models", category)] : []),
  ])];
}

export async function modelProfile(file) {
  if (!file.toLowerCase().endsWith(".safetensors")) return { architecture: "unknown" };
  const handle = await open(file, "r");
  try {
    const prefix = Buffer.alloc(8);
    if ((await handle.read(prefix, 0, 8, 0)).bytesRead !== 8) throw Error("Invalid header");
    const length = Number(prefix.readBigUInt64LE());
    if (length < 2 || length > 8 * 1024 ** 2) throw Error("Invalid header size");
    const header = Buffer.alloc(length);
    if ((await handle.read(header, 0, length, 8)).bytesRead !== length) throw Error("Incomplete header");
    const keys = Object.keys(JSON.parse(header.toString("utf8"))).filter(k => k !== "__metadata__");
    const has = suffix => keys.some(k => k === suffix || k.endsWith("." + suffix));
    if (has("blocks.0.mlp.layer1.weight") && has("llm_adapter.blocks.0.cross_attn.q_proj.weight")) return { architecture: "anima" };
    const clip = keys.some(k => /^(cond_stage_model\.|conditioner\.embedders\.|text_encoders\.|clip_l\.|clip_g\.)/.test(k));
    const vae = keys.some(k => k.startsWith("first_stage_model."));
    return { architecture: clip ? "checkpoint" : "separate", embeddedVae: vae };
  } finally { await handle.close(); }
}
