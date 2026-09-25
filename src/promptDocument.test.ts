import { describe, expect, it } from "vitest";
import {
  appendNamedBlock,
  compilePrompt,
  movePart,
  parsePrompt,
  serializePrompt,
} from "./promptDocument";
import { buildWorkflow, defaults } from "./workflow";
import { checkPrompts } from "./promptLibrary";
import { applyProposals, validateProposals } from "./promptOptimizer";
const contents = (value: string) =>
  parsePrompt(value).map(({ title, text }) => ({ title, text }));
describe("structured prompt document", () => {
  it("reads named sections and explicit return to free text", () => {
    expect(
      contents(
        "masterpiece,\r\n\r\n## Body\r\n(red_dress:1.2), blue_eyes,\r\n## Background\r\nbeach,\r\n##\r\n\r\nsoft light",
      ),
    ).toEqual([
      { title: null, text: "masterpiece," },
      { title: "Body", text: "(red_dress:1.2), blue_eyes," },
      { title: "Background", text: "beach," },
      { title: null, text: "soft light" },
    ]);
  });
  it("round trips sections, empty named blocks, Unicode and free text", () => {
    const original =
      "quality,\n\n## Vêtements 👗\nrobe rouge,\n##\n\nphoto,\n\n## Décor\n\n##";
    expect(contents(serializePrompt(parsePrompt(original)))).toEqual(
      contents(original),
    );
    expect(
      serializePrompt(
        parsePrompt("a natural-language prompt #1, (blue eyes:1.3)"),
      ),
    ).toBe("a natural-language prompt #1, (blue eyes:1.3)");
  });
  it("moves whole sections and preserves prompt contents", () => {
    const p = parsePrompt("intro,\n## Body\nred dress,\n## Background\nbeach,");
    const moved = movePart(p, 2, 1);
    expect(moved.map((p) => p.title)).toEqual([null, "Background", "Body"]);
    expect(moved.map((p) => p.text).sort()).toEqual(
      p.map((p) => p.text).sort(),
    );
    expect(movePart(p, 0, -1)).toBe(p);
  });
  it("preserves inline hashtags and weights while removing standalone comments", () => {
    const source =
      "## Body\n(red_dress:1.2), #fashion,\n# personal note\n##\ntext";
    expect(compilePrompt(source)).toBe("(red_dress:1.2), #fashion,\ntext");
    expect(compilePrompt(" red hair,  ")).toBe(" red hair,  ");
  });
  it("inserts reusable blocks under their title without absorbing free text", () => {
    const result = appendNamedBlock("intro,", "Body\ninjection", "red_dress,");
    expect(contents(result)).toEqual([
      { title: null, text: "intro," },
      { title: "Body injection", text: "red_dress," },
    ]);
    expect(appendNamedBlock(result, "Empty", "")).toBe(result);
  });
  it("never sends comment titles to CLIP and retains source settings", () => {
    const s = {
      ...defaults,
      model: "x",
      positive: "## Body\nred dress,\n##",
      negative: "## Avoid\nblur,\n##",
    };
    const { workflow } = buildWorkflow(s);
    expect(workflow["2"].inputs.text).toBe("red dress,");
    expect(workflow["3"].inputs.text).toBe("blur,");
    expect(s.positive).toContain("## Body");
    expect(() =>
      buildWorkflow({ ...s, positive: "## Only a title\n# comment" }),
    ).toThrow("Décrivez");
    expect(
      checkPrompts({
        positive: "## Body\nblue eyes",
        negative: "## Body\nblur",
      }),
    ).toEqual([]);
  });
});
describe("future voice optimizer contract", () => {
  it("validates proposals and appends only the explicitly accepted sections", () => {
    const p = validateProposals({
      blocks: [
        { title: "Body", text: "red_dress, blue_eyes", side: "positive" },
        { title: "Avoid", text: "blur", side: "negative" },
      ],
    });
    const result = applyProposals(
      { positive: "existing,", negative: "low quality," },
      [p[0]],
    );
    expect(result.positive).toContain("## Body");
    expect(result.positive).toContain("existing,");
    expect(result.negative).toBe("low quality,");
  });
  it("rejects malformed or unbounded model responses", () => {
    for (const result of [
      null,
      {},
      { blocks: [] },
      { blocks: [{ title: "x", text: "x", side: "system" }] },
      { blocks: [{ title: "x", text: "x".repeat(20001), side: "positive" }] },
    ])
      expect(() => validateProposals(result)).toThrow();
  });
});

describe("disabled prompt blocks", () => {
  it("omits only disabled sections and restores their content when enabled", () => {
    const source =
      "quality,\n## [off] Body\nred_dress,\n##\nfree,\n## Background\nbeach,";
    const parts = parsePrompt(source);
    expect(parts.find((p) => p.title === "Body")?.enabled).toBe(false);
    expect(compilePrompt(source)).toBe("quality,\nfree,\nbeach,");
    const enabled = serializePrompt(
      parts.map((p) => ({ ...p, enabled: true })),
    );
    expect(compilePrompt(enabled)).toContain("red_dress,");
    expect(serializePrompt(parsePrompt(source))).toContain("## [off] Body");
    expect(
      checkPrompts({ positive: "## [off] Sun\nsun\n##", negative: "sun" }),
    ).toEqual([]);
  });
});
