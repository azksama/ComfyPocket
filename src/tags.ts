export type Tag = { name: string; category: number; count: number; theme?: string };
export function tagRange(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = before.match(/[^,\n\r:<>\[\]]*$/)?.[0] ?? "";
  const leading = match.match(/^[\s(]*/)?.[0].length ?? 0;
  const start = caret - match.length + leading;
  const query = text.slice(start, caret).trim().replace(/\\([()])/g, "$1").replace(/\s+/g, "_").toLowerCase();
  let end = caret;
  while (end < text.length && !/[,\n\r:\[\]<>]/.test(text[end])) end++;
  // Keep weighted prompt syntax, e.g. (landscape:1.2), around the replaced tag.
  if (text[start - 1] === "(") while (end > caret && /[)\s]/.test(text[end - 1])) end--;
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
    return { text: prefix + closing + ", " + rest, caret: prefix.length + closing.length + 2 };
  }
  const rest = suffix.replace(/^,\s*/, "");
  return { text: prefix + ", " + rest, caret: prefix.length + 2 };
}
export function searchTags(rows: Tag[], query: string, limit = 8): Tag[] {
  if (!query || query.length > 80) return [];
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].name < query) lo = mid + 1; else hi = mid; }
  const top: Tag[] = [];
  for (let i = lo; i < rows.length && rows[i].name.startsWith(query); i++) {
    top.push(rows[i]);
    top.sort((a, b) => Number(b.name === query) - Number(a.name === query) || b.count - a.count);
    if (top.length > limit) top.pop();
  }
  return top;
}
