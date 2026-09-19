import { imageUrl } from "./api";

/** A memory budget matters more than a count when originals vary from KB to MB. */
export function createImageCache(
  load: (path: string) => Promise<string>,
  budget = 24 * 1024 * 1024,
) {
  const values = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  let size = 0;
  let generation = 0;
  return {
    get(path: string): Promise<string> {
      const saved = values.get(path);
      if (saved !== undefined) {
        values.delete(path);
        values.set(path, saved);
        return Promise.resolve(saved);
      }
      const request = pending.get(path);
      if (request) return request;
      const version = generation;
      const task = load(path)
        .then((value) => {
          // Requests belonging to a disconnected PC must never populate its replacement's cache.
          if (version === generation && value.length * 2 <= budget) {
            while (size + value.length * 2 > budget && values.size) {
              const oldest = values.keys().next().value!;
              size -= values.get(oldest)!.length * 2;
              values.delete(oldest);
            }
            values.set(path, value);
            size += value.length * 2;
          }
          return value;
        })
        .finally(() => {
          if (pending.get(path) === task) pending.delete(path);
        });
      pending.set(path, task);
      return task;
    },
    clear() {
      generation++;
      values.clear();
      pending.clear();
      size = 0;
    },
  };
}

const cache = createImageCache(imageUrl);
export const cachedImage = cache.get;
export const clearImageCache = cache.clear;
