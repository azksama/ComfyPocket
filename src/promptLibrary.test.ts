import { test, expect, beforeEach } from "vitest";
import { appendBlock, checkPrompts, rememberPrompt, readPromptLibrary } from "./promptLibrary";
import { searchTags } from "./tags";
import { parsePreset } from "./presetStore";
beforeEach(() => { const map = new Map<string, string>(); Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v) } }); });
test("substring search includes internal and prefixed words with deterministic ranking", () => {
  const rows = ["blue_swimsuit", "swimsuit", "swimsuit_under_clothes", "microswimsuit"].map((name, i) => ({ name, count: 100 - i, category: 0 }));
  expect(searchTags(rows, "Swimsuit").map(t => t.name)).toEqual(["swimsuit", "blue_swimsuit", "swimsuit_under_clothes", "microswimsuit"]);
  expect(searchTags(rows, "swimsuit", 2).map(t => t.name)).toEqual(["swimsuit", "blue_swimsuit"]);
});
test("checker normalizes weights and spaces without substring false positives", () => {
  expect(checkPrompts({ positive: "(sun:1.2), blue_sky", negative: "SUN, blue sky" })).toHaveLength(2);
  expect(checkPrompts({ positive: "sun, daytime", negative: "sunset, nighttime" })).toEqual([]);
  expect(checkPrompts({ positive: "daytime, nighttime", negative: "" })[0]).toContain("peuvent se contredire");
});
test("history deduplicates, persists both sides and retains newest 100", () => {
  for (let i = 0; i < 103; i++) rememberPrompt({ positive: `lake ${i}`, negative: "blur" });
  rememberPrompt({ positive: "lake 101", negative: "blur" });
  const list = readPromptLibrary("history"); expect(list).toHaveLength(100); expect(list[0].positive).toBe("lake 101"); expect(list[0].negative).toBe("blur");
  expect(appendBlock("lake, ", "soft_light, ")).toBe("lake, soft_light, ");
  expect(appendBlock("lake", " ")).toBe("lake");
});
test("preset thumbnail is optional and cannot inject external URLs", () => {
  const preset = { name: "Lake", mode: "simple", settings: {} };
  expect(parsePreset(preset).thumbnail).toBeUndefined();
  expect(parsePreset({ ...preset, thumbnail: "https://example.com/image" }).thumbnail).toBeUndefined();
  expect(parsePreset({ ...preset, thumbnail: "data:image/jpeg;base64,YQ==" }).thumbnail).toBe("data:image/jpeg;base64,YQ==");
});
