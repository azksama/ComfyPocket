import { describe, expect, it } from "vitest";
import { insertTranslation } from "./PromptTranslation";
describe("translated prompt insertion", () => {
  it("inserts at the caret and preserves surrounding punctuation", () => {
    expect(insertTranslation("sea, beach", " blue sky ", { start: 5, end: 5 })).toEqual({ text: "sea, blue sky beach", caret: 14 });
    expect(insertTranslation("(sun), sea", "bright", { start: 1, end: 4 }).text).toBe("(bright), sea");
  });
  it("replaces a selection as one edit and appends without a caret", () => {
    expect(insertTranslation("red sky", "blue", { start: 0, end: 3 }).text).toBe("blue sky");
    expect(insertTranslation("sea,", "sky", null).text).toBe("sea,sky");
    expect(insertTranslation("sea", "sky", null).text).toBe("sea sky");
    expect(insertTranslation("", "sky", null).text).toBe("sky");
  });
});
