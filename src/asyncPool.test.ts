import { expect, it } from "vitest";
import { mapConcurrent, pollingDelay } from "./asyncPool";

it("bounds network concurrency and preserves result order", async () => {
  let active = 0,
    peak = 0;
  const results = await mapConcurrent([5, 4, 3, 2, 1, 0], 3, async (n) => {
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, n));
    active--;
    return n * 2;
  });
  expect(peak).toBe(3);
  expect(results).toEqual([10, 8, 6, 4, 2, 0]);
});

it("keeps active jobs responsive and slows idle and background polling", () => {
  expect(pollingDelay(true, false)).toBe(1500);
  expect(pollingDelay(false, false)).toBe(5000);
  expect(pollingDelay(true, true)).toBe(15000);
});


it("waits for in-flight work after failure and never starts remaining items", async () => {
  const started: number[] = [];
  let active = 0;
  const task = mapConcurrent([0,1,2,3,4,5], 2, async n => {
    started.push(n); active++;
    try {
      if (!n) throw new Error("offline");
      await new Promise(resolve => setTimeout(resolve, 10));
      return n;
    } finally { active--; }
  });
  await expect(task).rejects.toThrow("offline");
  expect(active).toBe(0);
  expect(started).toEqual([0,1]);
});
