import { describe, it, expect } from "vitest";
import { zlibSync } from "fflate";
import { readFileSync } from "node:fs";
import { importImage, pngTags, parseTags, commentText } from "./metadata";
import { buildWorkflow, defaults } from "./workflow";
const encoder = new TextEncoder();
const bytes = (s: string) => encoder.encode(s);
const join = (...parts: Uint8Array[]) => { const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let offset = 0; for (const p of parts) { result.set(p, offset); offset += p.length; } return result; };
const chunk = (type: string, body: Uint8Array) => { const size = new Uint8Array(4); new DataView(size.buffer).setUint32(0, body.length); return join(size, bytes(type), body, new Uint8Array(4)); };
const text = "An alpine lake\nNegative prompt: blur\nSteps: 30, Sampler: Euler a, Schedule type: Karras, CFG scale: 5.5, Seed: 18446744073709551615, Size: 832x1216, Model: dreamshaper_8, Clip skip: 2, Hires upscale: 2, Hires steps: 20, Denoising strength: 0.7";
describe("generation metadata", () => {
  it("reads PNG text, compressed text and international text without changing uint64 seeds", async () => {
    for (const [type, body] of [["tEXt", join(bytes("parameters\0"), bytes(text))], ["zTXt", join(bytes("parameters\0\0"), zlibSync(bytes(text)))], ["iTXt", join(bytes("parameters\0\x01\0fr\0Paramètres\0"), zlibSync(bytes(text)))]] as const) {
      const png = join(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk(type, body), chunk("IEND", new Uint8Array()));
      const parsed = await importImage(png);
      expect(parsed.settings.seed).toBe("18446744073709551615"); expect(parsed.settings.width).toBe(832); expect(parsed.settings.negative).toBe("blur"); expect(parsed.settings.hires?.denoise).toBe(.7); expect(parsed.settings.sampler).toBe("euler_ancestral"); expect(parsed.settings.scheduler).toBe("karras");
    }
  });
  it("reads Stability Matrix parameters-json", () => {
    const parsed = parseTags({ "parameters-json": '{"PositivePrompt":"lake","NegativePrompt":"blur","Seed":18446744073709551615,"Steps":30,"CfgScale":5,"Width":1024,"Height":768,"ModelName":"dreamshaper_8","Sampler":"DPM++ 2M Karras"}' });
    expect(parsed.source).toBe("Stability Matrix"); expect(parsed.settings.seed).toBe("18446744073709551615"); expect(parsed.settings.sampler).toBe("dpmpp_2m");
  });
  it("follows the saved output graph and restores the base pass plus hires", () => {
    const s = { ...defaults, model: "x", positive: "lake", seed: "42", hires: { ...defaults.hires, enabled: true } };
    const { workflow } = buildWorkflow(s);
    const parsed = parseTags({ prompt: JSON.stringify(workflow) });
    expect(parsed.settings.seed).toBe("42"); expect(parsed.settings.positive).toBe("lake"); expect(parsed.settings.hires?.scale).toBe(2);
    expect(parseTags({ prompt: JSON.stringify(workflow), comfy_pocket: JSON.stringify({ version: 2, settings: s }) }).settings).toEqual(s);
  });
  it("decodes JPEG EXIF Unicode comments and does not invent metadata for ordinary pictures", async () => {
    const parsed = await importImage(readFileSync("tests/fixtures/parameters.jpg"));
    expect(parsed.settings.seed).toBe("18446744073709551615"); expect(parsed.settings.positive).toBe("A quiet lake");
    await expect(importImage(readFileSync("tests/fixtures/plain.jpg"))).rejects.toThrow("Aucun paramètre");
    expect(commentText(bytes("ASCII\0\0\0hello"))).toBe("hello");
  });
  it("rejects truncated chunks and decompression bombs", () => {
    const broken = new Uint8Array(20); new DataView(broken.buffer).setUint32(8, 0xffffffff);
    expect(() => pngTags(broken)).toThrow("tronqué");
    const png = join(new Uint8Array(8), chunk("zTXt", join(bytes("parameters\0\0"), zlibSync(new Uint8Array(9 * 1024 * 1024)))));
    expect(() => pngTags(png)).toThrow("volumineuses");
  });
});
