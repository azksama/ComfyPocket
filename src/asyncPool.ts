/** Run a bounded number of requests while preserving input order. */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  await Promise.all(
    Array.from(
      { length: Math.min(items.length, Math.max(1, Math.floor(limit))) },
      async () => {
        while (!failed && cursor < items.length) {
          const index = cursor++;
          try {
            results[index] = await fn(items[index]);
          } catch (error) {
            if (!failed) failure = error;
            failed = true;
          }
        }
      },
    ),
  );
  if (failed) throw failure;
  return results;
}

export const pollingDelay = (active: boolean, hidden: boolean) =>
  hidden ? 15000 : active ? 1500 : 5000;
