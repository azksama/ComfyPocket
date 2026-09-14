import https from "node:https";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const pairing = JSON.parse(await readFile(process.argv[2], "utf8"));
const out = process.argv[3];
if (out) await mkdir(out, { recursive: true });
function call(route, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(route, pairing.url);
    const req = https.request(
      u,
      {
        ca: pairing.certificate,
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${pairing.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const b = Buffer.concat(chunks);
          if (res.statusCode >= 400)
            return reject(
              new Error(`${res.statusCode}: ${b.toString().slice(0, 500)}`),
            );
          resolve(
            res.headers["content-type"]?.includes("json") ? JSON.parse(b) : b,
          );
        });
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const stats = await call("/api/system_stats");
const info = await call("/api/object_info");
const models = info.CheckpointLoaderSimple.input.required.ckpt_name[0];
console.log(
  JSON.stringify({
    gpu: stats.devices[0].name,
    models: models.length,
    loras: info.LoraLoader.input.required.lora_name[0].length,
  }),
);
const gallery = await call("/bridge/gallery?limit=3");
console.log(
  JSON.stringify({ galleryTotal: gallery.total, warnings: gallery.warnings }),
);
if (gallery.items.length) {
  const f = gallery.items[0];
  const image = await call(
    "/bridge/file?" +
      new URLSearchParams({ root: f.root, relative: f.relative }),
  );
  console.log(`Gallery image retrieval: ${image.length} bytes`);
}
const client = "comfy-pocket-live-check";
await call("/bridge/events?clientId=" + client);
await setTimeout(500);
const model =
  models.find((m) => m === "dreamshaper_8.safetensors") ?? models[0];
const workflow = {
  1: { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: model } },
  2: {
    class_type: "CLIPTextEncode",
    inputs: {
      text: "a small wooden cabin beside an alpine lake, pine trees, morning sunlight, landscape photography, no people",
      clip: ["1", 1],
    },
  },
  3: {
    class_type: "CLIPTextEncode",
    inputs: { text: "blurry, text, watermark", clip: ["1", 1] },
  },
  4: {
    class_type: "EmptyLatentImage",
    inputs: { width: 512, height: 512, batch_size: 1 },
  },
  5: {
    class_type: "KSampler",
    inputs: {
      model: ["1", 0],
      positive: ["2", 0],
      negative: ["3", 0],
      latent_image: ["4", 0],
      seed: 42,
      steps: 12,
      cfg: 7,
      sampler_name: "euler",
      scheduler: "normal",
      denoise: 1,
    },
  },
  6: { class_type: "VAEDecode", inputs: { samples: ["5", 0], vae: ["1", 2] } },
  7: {
    class_type: "SaveImage",
    inputs: {
      images: ["6", 0],
      filename_prefix: "ComfyPocket/Test_connection",
    },
  },
};
const result = await call("/api/prompt", {
  prompt: workflow,
  client_id: client,
});
console.log("Submitted " + result.prompt_id);
let seenProgress = false,
  seenPreview = false,
  cursor = 0;
for (let i = 0; i < 180; i++) {
  await setTimeout(1000);
  const events = await call(
    `/bridge/events?clientId=${client}&after=${cursor}`,
  );
  cursor = events.seq;
  seenProgress ||= events.events.some((e) => e.type === "progress");
  seenPreview ||= events.events.some((e) => e.type === "preview");
  const h = await call("/api/history/" + result.prompt_id);
  const entry = h[result.prompt_id];
  if (!entry) continue;
  if (entry.status.status_str === "error")
    throw new Error(JSON.stringify(entry.status));
  const image = Object.values(entry.outputs).flatMap((o) => o.images ?? [])[0];
  if (!image) continue;
  const bytes = await call("/api/view?" + new URLSearchParams(image));
  if (out) await writeFile(out + "/generation-test.png", bytes);
  const proof = {
    prompt_id: result.prompt_id,
    model,
    gpu: stats.devices[0].name,
    bytes: bytes.length,
    seenProgress,
    seenPreview,
    status: entry.status.status_str,
    galleryTotal: gallery.total,
    timestamp: new Date().toISOString(),
  };
  if (out)
    await writeFile(out + "/live-check.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
  process.exit(0);
}
throw new Error("Timeout de génération (3 minutes).");
