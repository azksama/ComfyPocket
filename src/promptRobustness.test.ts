import { beforeEach, expect, test, vi } from "vitest";
import {
  readPromptLibrary,
  rememberPrompt,
  writePromptLibrary,
  checkPrompts,
  appendBlock,
  type PromptEntry,
} from "./promptLibrary";
import { createTagSearch, searchTags } from "./tags";

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    },
  });
});
const entry = (id: string, positive = "lake"): PromptEntry => ({
  id,
  title: id,
  positive,
  negative: "blur",
  at: 1,
});

test("history trims oldest entries when space runs low, preserving reusable blocks", () => {
  writePromptLibrary("blocks", [entry("light")]);
  writePromptLibrary(
    "history",
    Array.from({ length: 8 }, (_, index) =>
      entry(String(index), "scene " + index),
    ),
  );
  const set = localStorage.setItem;
  vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
    if (key === "prompt-history-v1" && JSON.parse(value).length > 2)
      throw new DOMException("Full", "QuotaExceededError");
    set(key, value);
  });
  rememberPrompt({ positive: "new scene", negative: "blur" });
  expect(readPromptLibrary("history").map((item) => item.positive)).toEqual([
    "new scene",
    "scene 0",
  ]);
  expect(readPromptLibrary("blocks")).toEqual([entry("light")]);
});

test("a failed write never removes existing history and corrupt records are not overwritten", () => {
  const original = JSON.stringify([entry("original")]);
  stored.set("prompt-history-v1", original);
  vi.spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new DOMException("Full", "QuotaExceededError");
  });
  expect(() =>
    rememberPrompt({ positive: "replacement", negative: "" }),
  ).toThrow();
  expect(stored.get("prompt-history-v1")).toBe(original);
  stored.set("prompt-history-v1", "{broken");
  expect(() =>
    rememberPrompt({ positive: "replacement", negative: "" }),
  ).toThrow(/conservées/);
  expect(stored.get("prompt-history-v1")).toBe("{broken");
});

test("history writes are skipped for an unchanged latest prompt and bounded for large prompts", () => {
  rememberPrompt({ positive: "lake", negative: "blur" });
  const write = vi.spyOn(localStorage, "setItem");
  rememberPrompt({ positive: "lake", negative: "blur" });
  expect(write).not.toHaveBeenCalled();
  for (let index = 0; index < 20; index++)
    rememberPrompt({
      positive: String(index) + "a".repeat(30000),
      negative: "",
    });
  expect(stored.get("prompt-history-v1")!.length).toBeLessThanOrEqual(500000);
  expect(readPromptLibrary("history")[0].positive).toMatch(/^19/);
});

test("invalid records cannot break rendering through invalid dates or duplicate keys", () => {
  for (const value of [
    [entry("same"), entry("same")],
    [{ ...entry("future"), at: 1e20 }],
  ]) {
    stored.set("prompt-blocks-v1", JSON.stringify(value));
    expect(() => readPromptLibrary("blocks")).toThrow(/illisible/);
  }
});

test("opposite negative exclusions are compatible while conflicting positive instructions warn", () => {
  expect(
    checkPrompts({
      positive: "portrait",
      negative: "daytime, nighttime, eyes_open, eyes_closed",
    }),
  ).toEqual([]);
  expect(
    checkPrompts({ positive: "daytime, nighttime", negative: "" }),
  ).toHaveLength(1);
  expect(
    checkPrompts({
      positive: "<lora:film:0.8>, sun",
      negative: "<lora:film:0.8>, SUN",
    }),
  ).toEqual(["« sun » apparaît dans le positif et le négatif."]);
  expect(appendBlock("lake", ", , ")).toBe("lake");
});

test("search caches repeated normalized queries and evicts least recently used results", () => {
  const rows = [
    { name: "blue_sky", category: 0, count: 10 },
    { name: "night_sky", category: 0, count: 5 },
  ];
  const search = createTagSearch(rows, 2);
  const original = search("blue sky");
  expect(search(" BLUE_SKY ")).toBe(original);
  search("night");
  search("sky");
  expect(search("blue sky")).not.toBe(original);
  expect(searchTags(rows, "sky", Number.NaN)).toEqual([]);
  expect(searchTags(rows, "sky", Infinity)).toEqual([]);
});
