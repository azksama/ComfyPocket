import { gunzipSync, strFromU8 } from "fflate";
import indexUrl from "./data/booru.tsv.gz?url";
import { createTagSearch, type Tag } from "./tags";
let pending: { id: number; query: string } | undefined;
const ready = fetch(indexUrl).then(async (response) => {
  if (!response.ok) throw new Error("Index indisponible");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Dev HTTP can decode Content-Encoding:gzip; native assets return the packed bytes.
  const unpacked =
    bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes;
  const rows: Tag[] = strFromU8(unpacked)
    .trimEnd()
    .split("\n")
    .map((line) => {
      const [name, category, count] = line.split("\t");
      return {
        name: JSON.parse(name),
        category: Number(category),
        count: Number(count),
      };
    });
  self.postMessage({ ready: rows.length });
  return createTagSearch(rows);
});
ready.catch(() =>
  self.postMessage({
    error:
      "Les suggestions sont indisponibles. Vous pouvez continuer à écrire.",
  }),
);
self.onmessage = async (event: MessageEvent<{ id: number; query: string }>) => {
  pending = event.data;
  try {
    const search = await ready;
    if (pending !== event.data) return;
    self.postMessage({ id: event.data.id, tags: search(event.data.query) });
  } catch {
    /* The editor remains usable without suggestions. */
  }
};
