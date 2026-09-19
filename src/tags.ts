export type Tag = {
  name: string;
  category: number;
  count: number;
  theme?: string;
};
export function tagRange(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = before.match(/[^,\n\r:<>\[\]]*$/)?.[0] ?? "";
  const leading = match.match(/^[\s(]*/)?.[0].length ?? 0;
  const start = caret - match.length + leading;
  const query = text
    .slice(start, caret)
    .trim()
    .replace(/\\([()])/g, "$1")
    .replace(/\s+/g, "_")
    .toLowerCase();
  let end = caret;
  while (end < text.length && !/[,\n\r:\[\]<>]/.test(text[end])) end++;
  // Keep weighted prompt syntax, e.g. (landscape:1.2), around the replaced tag.
  if (text[start - 1] === "(")
    while (end > caret && /[)\s]/.test(text[end - 1])) end--;
  return { start, end, query };
}
export function insertTag(text: string, caret: number, name: string) {
  const { start, end } = tagRange(text, caret);
  const escaped = name.replace(/[()]/g, "\\$&");
  const suffix = text.slice(end);
  const prefix = text.slice(0, start) + escaped;
  // Keep the weight inside its parentheses, then place the comma outside them.
  if (text[start - 1] === "(") {
    const closing = suffix.match(/^(?::[+-]?(?:\d+(?:\.\d*)?|\.\d+))?\)/)?.[0];
    if (!closing) return { text: prefix + suffix, caret: prefix.length };
    const rest = suffix.slice(closing.length).replace(/^,\s*/, "");
    return {
      text: prefix + closing + ", " + rest,
      caret: prefix.length + closing.length + 2,
    };
  }
  const rest = suffix.replace(/^,\s*/, "");
  return { text: prefix + ", " + rest, caret: prefix.length + 2 };
}
export function normalizeTagQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, "_");
}

export function searchTags(rows: Tag[], query: string, limit = 8): Tag[] {
  query = normalizeTagQuery(query);
  if (!query || query.length > 80 || !Number.isFinite(limit) || limit < 1)
    return [];
  limit = Math.min(64, Math.floor(limit));
  const rank = (tag: Tag) =>
    tag.name === query
      ? 0
      : tag.name.startsWith(query)
        ? 1
        : tag.name.includes("_" + query)
          ? 2
          : 3;
  const compare = (a: Tag, b: Tag) =>
    Number(b.name === query) - Number(a.name === query) ||
    b.count - a.count ||
    rank(a) - rank(b) ||
    a.name.localeCompare(b.name);
  const top: Tag[] = [];
  for (const row of rows) {
    if (!row.name.includes(query)) continue;
    if (top.length === limit && compare(row, top[top.length - 1]) >= 0)
      continue;
    const index = top.findIndex((other) => compare(row, other) < 0);
    top.splice(index < 0 ? top.length : index, 0, row);
    if (top.length > limit) top.pop();
  }
  return top;
}

export function createTagSearch(rows: Tag[], cacheSize = 64) {
  const cache = new Map<string, Tag[]>();
  return (rawQuery: string) => {
    const query = normalizeTagQuery(rawQuery);
    const previous = cache.get(query);
    if (previous) {
      cache.delete(query);
      cache.set(query, previous);
      return previous;
    }
    const result = searchTags(rows, query);
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
    cache.set(query, result);
    return result;
  };
}
