import { describe, expect, it, vi } from "vitest";
import { createImageCache } from "./imageCache";

describe("image cache", () => {
  it("shares requests, retries failures and evicts the least recently used image by bytes", async () => {
    const load = vi.fn(async (path: string) => path.repeat(2));
    const cache = createImageCache(load, 8);
    await Promise.all([cache.get("a"), cache.get("a")]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get("b");
    await cache.get("a");
    await cache.get("c");
    await cache.get("b");
    expect(load.mock.calls.map((call) => call[0])).toEqual([
      "a",
      "b",
      "c",
      "b",
    ]);
    load.mockRejectedValueOnce(new Error("offline"));
    await expect(cache.get("d")).rejects.toThrow("offline");
    expect(await cache.get("d")).toBe("dd");
  });
  it("does not retain oversized originals", async () => {
    const load = vi.fn(async () => "oversized");
    const cache = createImageCache(load, 2);
    await cache.get("a");
    await cache.get("a");
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("isolates in-flight responses when changing PC", async () => {
    let resolve!: (value: string) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValue("new PC");
    const cache = createImageCache(load);
    const old = cache.get("same path");
    cache.clear();
    expect(await cache.get("same path")).toBe("new PC");
    resolve("old PC");
    await old;
    expect(await cache.get("same path")).toBe("new PC");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
