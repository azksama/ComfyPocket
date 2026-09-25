export type PromptPart = {
  id: string;
  title: string | null;
  text: string;
  enabled?: boolean;
};
const titleLine = /^\s*##[ \t]+(.+?)\s*$/;
const closeLine = /^\s*##\s*$/;
export const cleanTitle = (title: string) =>
  title
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 80) || "Bloc";
export function parsePrompt(text: string): PromptPart[] {
  const parts: PromptPart[] = [];
  let enabled = true;
  let title: string | null = null,
    lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").replace(/^\n|\n$/g, "");
    if (title !== null || text.length)
      parts.push({ id: crypto.randomUUID(), title, text, enabled });
    lines = [];
  };
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(titleLine);
    if (match || closeLine.test(line)) {
      flush();
      enabled = !match || !match[1].startsWith("[off] ");
      title = match ? cleanTitle(match[1].replace(/^\[off\] /, "")) : null;
    } else lines.push(line);
  }
  flush();
  return parts.length
    ? parts
    : [{ id: crypto.randomUUID(), title: null, text: "" }];
}
export function serializePrompt(parts: PromptPart[]): string {
  return parts
    .map((p) =>
      p.title === null
        ? p.text
        : `## ${p.enabled === false ? "[off] " : ""}${cleanTitle(p.title)}\n${p.text}\n##`,
    )
    .join("\n\n");
}
/** Only standalone comment lines are removed; inline hashtags and prompt weights stay intact. */
export function compilePrompt(text: string): string {
  if (!/^\s*#/m.test(text)) return text;
  let enabled = true;
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const heading = line.match(titleLine);
      if (heading) {
        enabled = !heading[1].startsWith("[off] ");
        return false;
      }
      if (closeLine.test(line)) {
        enabled = true;
        return false;
      }
      return enabled && !/^\s*#/.test(line);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export function appendNamedBlock(
  text: string,
  title: string,
  body: string,
): string {
  if (!body.trim()) return text;
  // Close a trailing block before inserting another document section.
  const parts = parsePrompt(text);
  parts.push({
    id: crypto.randomUUID(),
    title: cleanTitle(title),
    text: compilePrompt(body).trim(),
  });
  return serializePrompt(
    parts.filter((p) => p.title !== null || p.text.trim()),
  );
}
export function movePart(
  parts: PromptPart[],
  from: number,
  to: number,
): PromptPart[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= parts.length ||
    to >= parts.length ||
    from === to
  )
    return parts;
  const next = [...parts];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
