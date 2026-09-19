import { expect, test } from "vitest";
import { parseTags } from "./metadata";
import { buildWorkflow, checkWorkflow, defaults, normalizeSettings, parseWorkflow } from "./workflow";
import type { ObjectInfo } from "./api";

const parameters = (method: string) => `lake\nSteps: 20, Sampler: Euler, CFG scale: 5, Seed: 42, Size: 1024x1024, Model: fixture, Hires upscale: 2, Hires steps: 12, Hires upscaler: ${method}, Denoising strength: 0.5`;

test("A1111 bicubic hires imports the corresponding latent method without changing other settings", () => {
  const imported = parseTags({ parameters: parameters("Latent (bicubic)") });
  expect(imported.settings.hires?.method).toBe("bicubic");
  expect(imported.warnings).toEqual([]);
  const { workflow } = buildWorkflow(normalizeSettings(imported.settings));
  const upscale = Object.values(workflow).find(node => node.class_type === "LatentUpscale")!;
  expect(upscale.inputs).toMatchObject({ upscale_method: "bicubic", width: 2048, height: 2048 });
  expect(workflow["5"].inputs).toMatchObject({ seed: 42, steps: 20, cfg: 5, sampler_name: "euler" });
  const info = Object.fromEntries(Object.values(workflow).map(node => [node.class_type, { input: { required: {} } }])) as ObjectInfo;
  info.LatentUpscale.input.required.upscale_method = [["nearest-exact", "bicubic"]];
  expect(() => checkWorkflow(workflow, info)).not.toThrow();
  info.LatentUpscale.input.required.upscale_method = ["COMBO", { options: ["nearest-exact"] }];
  expect(() => checkWorkflow(workflow, info)).toThrow("bicubique importé n’est pas disponible");
});

test("unsupported latent import variants warn explicitly while nearest-exact remains unchanged", () => {
  const unsupported = parseTags({ parameters: parameters("Latent (bicubic antialiased)") });
  expect(unsupported.settings.hires?.method).toBe("nearest-exact");
  expect(unsupported.warnings.join(" ")).toContain("pas d’équivalent exact");
  const nearest = parseTags({ parameters: parameters("Latent (nearest-exact)") });
  expect(nearest.settings.hires?.method).toBe("nearest-exact");
  expect(nearest.warnings).toEqual([]);
  const trained = parseTags({ parameters: parameters("4x-Fixture") });
  expect(trained.settings.hires?.method).toBe("model:4x-Fixture");
});

test("the final image limit includes latent dimension rounding on both axes", () => {
  const settings = {
    ...defaults, model: "fixture", positive: "lake", seed: "42",
    hires: { ...defaults.hires, enabled: true, scale: 1.001 },
    upscale: { ...defaults.upscale, enabled: true, method: "model:fixture.pth", scale: 3.995 },
  };
  expect(() => buildWorkflow({ ...settings, width: 4096 })).toThrow("16 384 pixels");
  expect(() => buildWorkflow({ ...settings, height: 4096 })).toThrow("16 384 pixels");
  const boundary = buildWorkflow({ ...settings, width: 4096, hires: { ...settings.hires, scale: 1 }, upscale: { ...settings.upscale, scale: 4 } });
  expect(Object.values(boundary.workflow).find(node => node.class_type === "ImageScale")?.inputs.width).toBe(16384);
});

test("null and primitive workflow imports fail with a readable format error", () => {
  for (const value of ["null", "false", "42", '"text"', "[]", "{}", '{"prompt":null}']) {
    expect(() => parseWorkflow(value)).toThrow(/Workflow API|format API/);
  }
});
