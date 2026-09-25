import { describe, it, expect } from "vitest";
import {
  buildWorkflow,
  defaults,
  parseWorkflow,
  checkWorkflow,
} from "./workflow";
describe("ComfyUI workflows", () => {
  it("chains LoRA model and CLIP into the sampler and encoders", () => {
    const { workflow: w, seed } = buildWorkflow({
      ...defaults,
      model: "sdxl.safetensors",
      positive: "lake",
      seed: "42",
      loras: [
        { name: "a.safetensors", strength: 0.7 },
        { name: "b.safetensors", strength: 0.3 },
      ],
    });
    expect(seed).toBe(42);
    expect(w["21"].inputs.model).toEqual(["20", 0]);
    expect(w["2"].inputs.clip).toEqual(["21", 1]);
    expect(w["5"].inputs.model).toEqual(["21", 0]);
    expect(w["7"].inputs.images).toEqual(["6", 0]);
  });
  it("rejects unsafe or invalid generation parameters", () => {
    for (const patch of [
      { width: 513 },
      { height: 0 },
      { seed: "18446744073709551616" },
      { steps: NaN },
      { batch: 9 },
      { batches: 0 },
      { loras: [{ name: "x", strength: NaN }] },
    ])
      expect(() =>
        buildWorkflow({ ...defaults, model: "x", positive: "lake", ...patch }),
      ).toThrow();
  });
  it("accepts API graphs and rejects visual editor graphs", () => {
    expect(() => parseWorkflow('{"nodes":[]}')).toThrow("format API");
    const w = { "1": { class_type: "Test", inputs: { text: "a" } } };
    expect(parseWorkflow(JSON.stringify({ prompt: w }))).toEqual(w);
    expect(() => checkWorkflow(w, {})).toThrow("Test");
  });
  it("preserves uint64 seeds through JSON and the ComfyUI INT string contract", () => {
    const { workflow, seed } = buildWorkflow({ ...defaults, model: "x", positive: "lake", seed: "18446744073709551615" });
    expect(seed).toBe("18446744073709551615");
    expect(workflow["5"].inputs.seed).toBe(seed);
    expect(parseWorkflow('{"1":{"class_type":"KSampler","inputs":{"seed":18446744073709551615}}}')["1"].inputs.seed).toBe(seed);
  });
  it("chains hires sampling and a trained final upscaler after the decoded image", () => {
    const { workflow: w } = buildWorkflow({ ...defaults, model: "x", positive: "lake", batch: 2, hires: { enabled: true, method: "nearest-exact", scale: 1.5, steps: 12, denoise: .4 }, upscale: { enabled: true, method: "model:4x.pth", scale: 2 } });
    const get = (type: string) => Object.entries(w).filter(([, n]) => n.class_type === type);
    expect(get("KSampler")).toHaveLength(2);
    const hi = get("KSampler")[1];
    expect(hi[1].inputs.denoise).toBe(.4);
    expect(w["6"].inputs.samples).toEqual([hi[0], 0]);
    expect(get("LatentUpscale")[0][1].inputs.width).toBe(1536);
    expect(get("ImageScale")[0][1].inputs.width).toBe(3072);
    expect(w["4"].inputs.batch_size).toBe(2);
    expect(w["7"].inputs.images).toEqual([get("ImageScale")[0][0], 0]);
  });
});

const animaInfo = {
  CLIPLoader: { input: { required: { clip_name: [["qwen_3_06b_base.safetensors"]] } } },
  VAELoader: { input: { required: { vae_name: [["qwen_image_vae.safetensors"]] } } },
};
it("Anima uses external Qwen encoder and VAE, without inherited SDXL clip skip", () => {
  for (const diffusion of [false, true]) {
    const { workflow: w } = buildWorkflow({ ...defaults, model: "renamed.safetensors", positive: "lake", clipSkip: 2 }, { architecture: "anima", diffusion }, animaInfo);
    expect(w["1"].class_type).toBe(diffusion ? "UNETLoader" : "CheckpointLoaderSimple");
    expect(w["2"].inputs.clip).toEqual(["20", 0]);
    expect(w["6"].inputs.vae).toEqual(["21", 0]);
    expect(w["20"].inputs.clip_name).toBe("qwen_3_06b_base.safetensors");
    expect(w["21"].inputs.vae_name).toBe("qwen_image_vae.safetensors");
    expect(Object.values(w).some(n => n.class_type === "CLIPSetLastLayer")).toBe(false);
  }
});
it("Anima blocks missing dependencies and incompatible VAE before submitting a prompt", () => {
  const s = { ...defaults, model: "anima.safetensors", positive: "lake" };
  expect(() => buildWorkflow(s, { architecture: "anima" }, {})).toThrow("Anima nécessite");
  expect(() => buildWorkflow({ ...s, vae: "sdxl.safetensors" }, { architecture: "anima" }, animaInfo)).toThrow("VAE");
  expect(() => buildWorkflow(s, { architecture: "separate" })).toThrow("workflow API");
});
it("checkpoint without embedded VAE remains usable with an explicit VAE", () => {
  const s = { ...defaults, model: "no-vae.safetensors", positive: "lake" };
  expect(() => buildWorkflow(s, { architecture: "checkpoint", embeddedVae: false })).toThrow("ne contient pas de VAE");
  const {workflow:w} = buildWorkflow({...s, vae:"sdxl_vae.safetensors"}, {architecture:"checkpoint", embeddedVae:false});
  expect(w["20"].class_type).toBe("VAELoader");
  expect(w["6"].inputs.vae).toEqual(["20",0]);
});
