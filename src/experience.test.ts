import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { choices } from "./api";
import { insertTag, searchTags, type Tag } from "./tags";
import { parsePreset } from "./presetStore";
import { defaults } from "./workflow";
import glossary from "./data/glossary.json";
const rows: Tag[] = gunzipSync(readFileSync("src/data/booru.tsv.gz")).toString().split("\n").map(line => { const [name, category, count] = line.split("\t"); return { name: JSON.parse(name), category: +category, count: +count }; });
test("offline index is ordered, complete and finds popular prefix tags", () => {
  expect(rows.length).toBe(234011);
  expect(rows.every((r, i) => !i || rows[i - 1].name < r.name)).toBe(true);
  expect(searchTags(rows, "landsc")[0].name).toBe("landscape");
  expect(searchTags(rows, "zzzz-unfindable")).toEqual([]);
});
test("autocomplete replaces at the caret and preserves surrounding weighted syntax", () => {
  expect(insertTag("forest, lands, sky", 13, "landscape").text).toBe("forest, landscape, sky");
  expect(insertTag("forest, (landsc:1.2), sky", 14, "landscape").text).toBe("forest, (landscape:1.2), sky");
  expect(insertTag("lands", 5, "landscape")).toEqual({ text: "landscape, ", caret: 11 });
});
test("upscalers accept legacy lists and modern COMBO options", () => {
  expect(choices({ N: { input: { required: { model: ["COMBO", { options: ["UltraSharp.pth"] }] } } } }, "N", "model")).toEqual(["UltraSharp.pth"]);
  expect(choices({ N: { input: { required: { model: [["UltraSharp.pth"]] } } } }, "N", "model")).toEqual(["UltraSharp.pth"]);
});
test("glossary keeps reference Lighting group and excludes catalogue character and copyright tags", () => {
  expect(glossary.themes.find(t => t.id === "Lighting")?.sections.find(s => s.name === "Directional")?.tags).toContain("backlighting");
  const banned = new Set(rows.filter(r => r.category === 3 || r.category === 4).map(r => r.name));
  expect(glossary.themes.flatMap(t => t.sections.flatMap(s => s.tags)).filter(t => banned.has(t))).toEqual([]);
  expect(glossary.themes.some(t => /characters|pok.mon|digimon|vocaloid/i.test(t.name))).toBe(false);
});
test("named presets preserve all inference settings and the uint64 seed", () => {
  const settings = { ...defaults, positive: "landscape", seed: "18446744073709551615", loras: [{ name: "film.safetensors", strength: .65 }], hires: { ...defaults.hires, enabled: true }, upscale: { ...defaults.upscale, enabled: true, method: "model:4x-UltraSharp.pth" } };
  const preset = parsePreset({ name: "Paysage du matin", settings, mode: "simple" });
  expect(preset.settings).toEqual(settings);
  expect(parsePreset(JSON.parse(JSON.stringify(preset)))).toEqual(preset);
  expect(() => parsePreset({ name: " ", settings })).toThrow();
});
