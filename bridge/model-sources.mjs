import path from "node:path";
import {
  remoteJson,
  providerUrl,
  importError as fail,
} from "./import-network.mjs";
export const kinds = [
  "checkpoints",
  "loras",
  "vae",
  "upscale_models",
  "embeddings",
  "controlnet",
  "diffusion_models",
  "text_encoders",
  "clip_vision",
];
export function modelFilename(name) {
  if (
    typeof name !== "string" ||
    name.length > 180 ||
    !/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(name) ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) ||
    name.startsWith(".") ||
    name.endsWith(" ")
  )
    throw fail("Nom ou format de fichier non pris en charge.");
  return name;
}
const segments = (value) =>
  value
    .split("/")
    .map((x) => encodeURIComponent(x))
    .join("/");
const guess = (name, type = "") =>
  ({
    Checkpoint: "checkpoints",
    LORA: "loras",
    LoCon: "loras",
    VAE: "vae",
    Upscaler: "upscale_models",
    TextualInversion: "embeddings",
    Controlnet: "controlnet",
  })[type] ||
  (/lora|lycoris/i.test(name)
    ? "loras"
    : /vae/i.test(name)
      ? "vae"
      : /upscal|esrgan/i.test(name)
        ? "upscale_models"
        : /clip_vision/i.test(name)
          ? "clip_vision"
          : /text_encoder|(^|\/)clip[_.\/]|t5xxl/i.test(name)
            ? "text_encoders"
            : /unet|diffusion_pytorch/i.test(name)
              ? "diffusion_models"
              : "");
const validHash = (h) =>
  typeof h === "string" && /^[a-f0-9]{64}$/i.test(h)
    ? h.toLowerCase()
    : undefined;
export async function inspectModel(input, json = remoteJson) {
  if (typeof input?.url !== "string" || input.url.length > 4096)
    throw fail("Lien invalide.");
  let url;
  try {
    url = new URL(input.url.trim());
  } catch {
    throw fail("Lien invalide.");
  }
  const provider = ["civitai.com", "civitai.red"].includes(url.hostname)
    ? "civitai"
    : "huggingface";
  providerUrl(url.href, provider);
  const token = input.token || url.searchParams.get("token") || "";
  if (typeof token !== "string" || token.length > 2048 || /[\r\n]/.test(token))
    throw fail("Clé d’accès invalide.");
  const options = { provider, token };
  let title,
    files = [];
  if (provider === "civitai") {
    const match = url.pathname.match(
      /^\/(models|api\/download\/models)\/(\d+)(?:\/[^/]*)?\/?$/,
    );
    if (!match)
      throw fail(
        "Collez une page de modèle Civitai ou son lien de téléchargement.",
      );
    const versionId =
      url.searchParams.get("modelVersionId") ||
      (match[1] !== "models" ? match[2] : null);
    if (versionId && !/^\d+$/.test(versionId))
      throw fail("Version Civitai invalide.");
    const base = url.origin;
    const data = await json(
      `${base}/api/v1/${versionId ? "model-versions/" + versionId : "models/" + match[2]}`,
      options,
    );
    const versions = versionId ? [data] : data.modelVersions || [];
    title = String(data.model?.name || data.name || "Civitai").slice(0, 160);
    for (const v of versions)
      for (const f of v.files || []) {
        if (
          !f.downloadUrl ||
          !["Model", "VAE"].includes(f.type) ||
          /danger|error|infected/i.test(
            `${f.pickleScanResult} ${f.virusScanResult}`,
          )
        )
          continue;
        try {
          modelFilename(f.name);
          providerUrl(f.downloadUrl, provider, true);
        } catch {
          continue;
        }
        files.push({
          id: String(f.id),
          name: f.name,
          label: `${v.name} · ${f.name}`,
          kind: guess(
            f.name,
            f.type === "VAE" ? "VAE" : data.type || v.model?.type,
          ),
          size: Math.round(Number(f.sizeKB) * 1024) || null,
          sha256: validHash(f.hashes?.SHA256),
          url: f.downloadUrl,
          baseModel: String(v.baseModel || "").slice(0, 100),
        });
      }
  } else {
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);
    if (
      parts.length < 2 ||
      parts.some((p) => p === ".." || p === "." || /[\\\x00]/.test(p))
    )
      throw fail("Lien Hugging Face invalide.");
    const repo = parts.slice(0, 2).join("/");
    let revision = "main",
      filename = "",
      prefix = "";
    if (parts.length > 2) {
      if (!["blob", "resolve", "tree"].includes(parts[2]) || !parts[3])
        throw fail(
          "Collez une page de dépôt Hugging Face ou le lien d’un fichier.",
        );
      revision = parts[3];
      if (parts[2] === "tree") prefix = parts.slice(4).join("/");
      else filename = parts.slice(4).join("/");
    }
    const data = await json(
      `https://huggingface.co/api/models/${segments(repo)}/revision/${encodeURIComponent(revision)}?blobs=true`,
      options,
    );
    title = String(data.id || repo).slice(0, 160);
    // Pin the resolved commit, so the file cannot change between inspection and download.
    const commit = /^[a-f0-9]{40,64}$/i.test(data.sha || "")
      ? data.sha
      : revision;
    for (const f of data.siblings || []) {
      const name = f.rfilename;
      if (
        typeof name !== "string" ||
        (filename && name !== filename) ||
        (prefix && !name.startsWith(prefix + "/"))
      )
        continue;
      if (/-\d{5}-of-\d{5}\./.test(name)) continue;
      // Diffusers repositories need a full pipeline; only standalone weights are installed.
      if (
        /(^|\/)(unet|transformer|vae|text_encoder[^/]*)\/.*\.(bin|safetensors)$/.test(
          name,
        )
      )
        continue;
      try {
        modelFilename(path.posix.basename(name));
      } catch {
        continue;
      }
      files.push({
        id: name,
        name: path.posix.basename(name),
        label: name,
        kind: guess(name + " " + repo),
        size: f.lfs?.size || f.size || null,
        sha256: validHash(f.lfs?.sha256),
        url: `https://huggingface.co/${segments(repo)}/resolve/${encodeURIComponent(commit)}/${segments(name)}`,
        baseModel: "",
      });
    }
  }
  if (!files.length)
    throw fail(
      "Aucun fichier de modèle autonome compatible. Les archives, pipelines Diffusers et modèles découpés ne sont pas installés.",
    );
  if (files.length > 500)
    throw fail("Trop de fichiers. Collez le lien d’un fichier précis.");
  return { provider, title, files, token };
}
