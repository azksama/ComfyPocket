import { it, expect } from "vitest";
import { weightRange, setTagWeight } from "./promptWeights";
it("weights the caret tag without changing neighbors or doubling existing syntax", () => {
  const raw = "blue_eyes, bed, red_dress,";
  const range = weightRange(raw, 12)!;
  expect(range.tag).toBe("bed");
  expect(setTagWeight(raw, range, 1.5)).toBe(
    "blue_eyes, (bed:1.5), red_dress,",
  );
  const old = "(bed:1.5), sea";
  expect(setTagWeight(old, weightRange(old, 4)!, 1)).toBe("bed, sea");
  expect(weightRange("## Body", 5)).toBeNull();
  expect(weightRange("a, b", 0, 4)).toBeNull();
  expect(() => setTagWeight(raw, range, NaN)).toThrow();
});
