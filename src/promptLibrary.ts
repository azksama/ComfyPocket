export type Prompts = { positive: string; negative: string };
export type PromptEntry = Prompts & { id: string; title: string; at: number };
export type LibraryKind = "history" | "blocks";

export const PROMPT_LIBRARY_LIMIT = 100;
const MAX_PROMPT_LENGTH = 100_000;
const HISTORY_BUDGET = 500_000;
const key = (kind: LibraryKind) => `prompt-${kind}-v1`;

function isEntry(value: unknown): value is PromptEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PromptEntry>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 100 &&
    typeof item.title === "string" &&
    item.title.length <= 80 &&
    typeof item.positive === "string" &&
    item.positive.length <= MAX_PROMPT_LENGTH &&
    typeof item.negative === "string" &&
    item.negative.length <= MAX_PROMPT_LENGTH &&
    typeof item.at === "number" &&
    Number.isFinite(item.at) &&
    item.at >= 0 &&
    item.at <= 8.64e15
  );
}

function validateEntries(value: unknown): asserts value is PromptEntry[] {
  if (
    !Array.isArray(value) ||
    value.length > PROMPT_LIBRARY_LIMIT ||
    !value.every(isEntry) ||
    new Set(value.map((item) => item.id)).size !== value.length
  ) {
    throw new Error(
      "Bibliothèque de prompts illisible. Les données enregistrées ont été conservées.",
    );
  }
}

export function readPromptLibrary(kind: LibraryKind): PromptEntry[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(kind));
  } catch {
    throw new Error("Le stockage de cet appareil est indisponible.");
  }
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "[]");
  } catch {
    throw new Error(
      "Bibliothèque de prompts illisible. Les données enregistrées ont été conservées.",
    );
  }
  validateEntries(data);
  return data;
}

export function writePromptLibrary(kind: LibraryKind, entries: PromptEntry[]) {
  if (entries.length > PROMPT_LIBRARY_LIMIT)
    throw new Error("Limite de 100 éléments atteinte.");
  validateEntries(entries);
  localStorage.setItem(key(kind), JSON.stringify(entries));
}

function isQuotaError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function promptStorageError(error: unknown) {
  if (isQuotaError(error))
    return "Le stockage est plein. Libérez des éléments dans l’historique ou les blocs, puis réessayez.";
  return error instanceof Error
    ? error.message
    : "L’enregistrement sur cet appareil a échoué.";
}

export function rememberPrompt(prompts: Prompts) {
  if (!prompts.positive.trim() && !prompts.negative.trim()) return;
  const saved = readPromptLibrary("history");
  if (
    saved[0]?.positive === prompts.positive &&
    saved[0]?.negative === prompts.negative
  )
    return;
  const entry = {
    ...prompts,
    id: crypto.randomUUID(),
    title: (prompts.positive.trim() || prompts.negative.trim()).slice(0, 80),
    at: Date.now(),
  };
  const entries = [
    entry,
    ...saved.filter(
      (p) => p.positive !== prompts.positive || p.negative !== prompts.negative,
    ),
  ].slice(0, PROMPT_LIBRARY_LIMIT);
  // History is disposable oldest-first; reusable blocks are never evicted.
  const sizes = entries.map((item) => JSON.stringify(item).length + 1);
  let totalSize = sizes.reduce((total, size) => total + size, 2);
  while (entries.length > 1 && totalSize > HISTORY_BUDGET) {
    entries.pop();
    totalSize -= sizes.pop()!;
  }
  for (;;) {
    try {
      writePromptLibrary("history", entries);
      return;
    } catch (error) {
      if (!isQuotaError(error) || entries.length === 1) throw error;
      entries.splice(Math.max(1, Math.floor(entries.length * 0.75)));
    }
  }
}

export function appendBlock(text: string, block: string) {
  const addition = block.trim().replace(/^,+\s*|,+\s*$/g, "");
  if (!addition) return text;
  return (
    [text.trim().replace(/,+\s*$/, ""), addition].filter(Boolean).join(", ") +
    ", "
  );
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\\([()])/g, "$1")
    .replace(/:[+-]?(?:\d+\.?\d*|\.\d+)\s*\)*$/g, "")
    .replace(/^[([\s]+|[)\]\s]+$/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const groups = [
  ["day", "daytime", "jour", "sunny"],
  ["night", "nighttime", "nuit"],
  ["monochrome", "black and white", "grayscale"],
  ["colorful", "multicolored"],
  ["eyes open", "open eyes"],
  ["eyes closed", "closed eyes"],
  ["indoors", "indoor", "intérieur"],
  ["outdoors", "outdoor", "extérieur"],
];

export function checkPrompts(prompts: Prompts): string[] {
  const tokens = (text: string) => [
    ...new Set(
      text
        .split(/[,\n]/)
        .map(normalize)
        .filter((tag) => tag && !tag.startsWith("<")),
    ),
  ];
  const positive = tokens(prompts.positive),
    negative = tokens(prompts.negative);
  const negativeSet = new Set(negative);
  const messages: string[] = [];
  for (const tag of positive)
    if (negativeSet.has(tag))
      messages.push(`« ${tag} » apparaît dans le positif et le négatif.`);
  for (const group of groups) {
    const p = positive.find((t) => group.includes(t)),
      n = negative.find((t) => group.includes(t));
    if (p && n && p !== n)
      messages.push(
        `« ${p} » et « ${n} » expriment une idée similaire dans les deux prompts.`,
      );
  }
  // Excluding two opposite attributes does not request an impossible scene.
  for (let i = 0; i < groups.length; i += 2) {
    const a = positive.find((t) => groups[i].includes(t)),
      b = positive.find((t) => groups[i + 1].includes(t));
    if (a && b)
      messages.push(
        `Prompt positif : « ${a} » et « ${b} » peuvent se contredire selon la scène.`,
      );
  }
  return messages;
}
