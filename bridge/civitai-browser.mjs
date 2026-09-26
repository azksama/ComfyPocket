import { createThumbnailer } from "./thumbnails.mjs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  remoteJson,
  remoteStream,
  providerUrl,
  importError as fail,
} from "./import-network.mjs";

export function createCivitaiBrowser({
  json = remoteJson,
  stream = remoteStream,
} = {}) {
  const previews = new Map();
  const thumbnails = createThumbnailer({
    concurrency: 3,
    render: async (url) => {
      const response = await stream(url, {
        provider: "civitai",
        download: true,
        signal: AbortSignal.timeout(15000),
      });
      const chunks = [];
      let size = 0;
      for await (const chunk of response) {
        size += chunk.length;
        if (size > 8 * 1024 ** 2) {
          response.destroy();
          throw fail("Illustration trop volumineuse.", 413);
        }
        chunks.push(chunk);
      }
      return sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({
          width: 400,
          height: 500,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer();
    },
  });
  let requests = 0;
  return {
    async search(input = {}) {
      if (requests >= 3)
        throw fail("Une recherche est déjà en cours. Patientez.", 429);
      const host = input.host ?? "civitai.com";
      if (!["civitai.com", "civitai.red"].includes(host))
        throw fail("Domaine Civitai invalide.");
      const params = new URLSearchParams({
        limit: "20",
        nsfw: "false",
        primaryFileOnly: "true",
        sort: "Most Downloaded",
      });
      const types = [
        "Checkpoint",
        "LORA",
        "LoCon",
        "VAE",
        "Upscaler",
        "TextualInversion",
        "Controlnet",
      ];
      if (input.type) {
        if (!types.includes(input.type)) throw fail("Type de modèle invalide.");
        params.set("types", input.type);
      }
      if (input.sort) {
        if (
          !["Most Downloaded", "Newest", "Highest Rated"].includes(input.sort)
        )
          throw fail("Tri invalide.");
        params.set("sort", input.sort);
      }
      for (const [key, limit] of [
        ["query", 160],
        ["baseModels", 100],
        ["cursor", 512],
      ]) {
        const value = input[key];
        if (
          value != null &&
          (typeof value !== "string" ||
            value.length > limit ||
            /[\x00-\x1f]/.test(value))
        )
          throw fail("Recherche invalide.");
        if (value?.trim()) params.set(key, value.trim());
      }
      const token = input.token || "";
      if (
        typeof token !== "string" ||
        token.length > 2048 ||
        /[\r\n]/.test(token)
      )
        throw fail("Clé invalide.");
      requests++;
      try {
        const data = await json(`https://${host}/api/v1/models?${params}`, {
          provider: "civitai",
          token,
        });
        if (!Array.isArray(data.items))
          throw fail("Catalogue Civitai invalide.", 502);
        const items = data.items
          .slice(0, 20)
          .filter((m) => Number.isSafeInteger(m.id) && !m.nsfw && !m.mode)
          .map((m) => {
            const versions = (
              Array.isArray(m.modelVersions) ? m.modelVersions : []
            )
              .filter(
                (v) =>
                  Number.isSafeInteger(v.id) &&
                  (!input.baseModels || v.baseModel === input.baseModels),
              )
              .slice(0, 100);
            const safeImage = versions
              .flatMap((v) => (Array.isArray(v.images) ? v.images : []))
              .find(
                (i) =>
                  i.type !== "video" &&
                  !/\.(mp4|webm)(?:[?]|$)/i.test(i.url || "") &&
                  (i.nsfw === false ||
                    i.nsfw === "None" ||
                    i.nsfwLevel === 1 ||
                    (i.nsfw === undefined && i.nsfwLevel === undefined)),
              );
            let preview = "";
            if (safeImage?.url)
              try {
                const url = providerUrl(safeImage.url, "civitai", true);
                if (url.hostname === "image.civitai.com") {
                  const id = randomUUID();
                  if (previews.size >= 400)
                    previews.delete(previews.keys().next().value);
                  previews.set(id, {
                    url: url.href,
                    expires: Date.now() + 30 * 60000,
                  });
                  preview = `/bridge/civitai/image?id=${id}`;
                }
              } catch {}
            return {
              id: m.id,
              title: String(m.name || "Civitai").slice(0, 200),
              type: String(m.type || "").slice(0, 40),
              creator: String(m.creator?.username || "").slice(0, 100),
              preview,
              versions: versions.map((v) => ({
                id: v.id,
                name: String(v.name || "").slice(0, 160),
                baseModel: String(v.baseModel || "").slice(0, 100),
                url: `https://${host}/models/${m.id}?modelVersionId=${v.id}`,
              })),
            };
          })
          .filter((m) => m.versions.length);
        let cursor = data.metadata?.nextCursor;
        if (cursor == null && data.metadata?.nextPage)
          try {
            const next = providerUrl(data.metadata.nextPage, "civitai");
            cursor = next.searchParams.get("cursor");
          } catch {}
        return {
          items,
          cursor:
            typeof cursor === "string" || typeof cursor === "number"
              ? String(cursor).slice(0, 512)
              : null,
        };
      } finally {
        requests--;
      }
    },
    async image(id) {
      const preview = previews.get(id);
      if (!preview || preview.expires < Date.now())
        throw fail("Illustration expirée. Relancez la recherche.", 404);
      return thumbnails(preview.url, preview.url);
    },
  };
}
