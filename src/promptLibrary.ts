export type Prompts = { positive: string; negative: string };
export type PromptEntry = Prompts & { id: string; title: string; at: number };
export type LibraryKind = "history" | "blocks";
const key = (kind: LibraryKind) => `prompt-${kind}-v1`;
export function readPromptLibrary(kind: LibraryKind): PromptEntry[] {
  const data: unknown = JSON.parse(localStorage.getItem(key(kind)) ?? "[]");
  if (!Array.isArray(data) || data.length > 100 || data.some(v => !v || typeof v.id !== "string" || typeof v.title !== "string" || typeof v.positive !== "string" || typeof v.negative !== "string" || typeof v.at !== "number")) throw Error("Bibliothèque de prompts illisible.");
  return data;
}
export function writePromptLibrary(kind: LibraryKind, entries: PromptEntry[]) {
  if (entries.length > 100) throw Error("Limite de 100 éléments atteinte.");
  localStorage.setItem(key(kind), JSON.stringify(entries));
}
export function rememberPrompt(prompts: Prompts) {
  if (!prompts.positive.trim() && !prompts.negative.trim()) return;
  const entries = readPromptLibrary("history").filter(p => p.positive !== prompts.positive || p.negative !== prompts.negative);
  writePromptLibrary("history", [{ ...prompts, id: crypto.randomUUID(), title: (prompts.positive || prompts.negative).slice(0, 80), at: Date.now() }, ...entries].slice(0, 100));
}
export function appendBlock(text: string, block: string) {
  return block.trim() ? [text.trim().replace(/,\s*$/, ""), block.trim().replace(/^,\s*/, "").replace(/,\s*$/, "")].filter(Boolean).join(", ") + ", " : text;
}
const normalize = (text: string) => text.toLowerCase().replace(/\\([()])/g, "$1").replace(/:[+-]?(?:\d+\.?\d*|\.\d+)\s*\)*$/g, "").replace(/^[([\s]+|[)\]\s]+$/g, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
const groups = [["day", "daytime", "jour", "sunny"], ["night", "nighttime", "nuit"], ["monochrome", "black and white", "grayscale"], ["colorful", "multicolored"], ["eyes open", "open eyes"], ["eyes closed", "closed eyes"], ["indoors", "indoor", "intérieur"], ["outdoors", "outdoor", "extérieur"]];
export function checkPrompts(prompts: Prompts): string[] {
  const tokens = (text: string) => [...new Set(text.split(/[,\n]/).map(normalize).filter(Boolean))];
  const positive = tokens(prompts.positive), negative = tokens(prompts.negative), messages: string[] = [];
  for (const tag of positive) if (negative.includes(tag)) messages.push(`« ${tag} » apparaît dans le positif et le négatif.`);
  for (const group of groups) {
    const p = positive.find(t => group.includes(t)), n = negative.find(t => group.includes(t));
    if (p && n && p !== n) messages.push(`« ${p} » et « ${n} » expriment une idée similaire dans les deux prompts.`);
  }
  for (const [label, tags] of [["positif", positive], ["négatif", negative]] as const) {
    for (let i = 0; i < groups.length; i += 2) {
      const a = tags.find(t => groups[i].includes(t)), b = tags.find(t => groups[i + 1].includes(t));
      if (a && b) messages.push(`Prompt ${label} : « ${a} » et « ${b} » peuvent se contredire selon la scène.`);
    }
  }
  return messages;
}
