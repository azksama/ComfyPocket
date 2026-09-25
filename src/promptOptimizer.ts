import type { Prompts } from "./promptLibrary";
import { appendNamedBlock, cleanTitle } from "./promptDocument";
export type PromptProposal = {
  title: string;
  text: string;
  side: keyof Prompts;
};
export interface PromptOptimizer {
  name: string;
  dictate?: (language: "fr" | "en", signal: AbortSignal) => Promise<string>;
  optimize: (
    input: { description: string; language: "fr" | "en"; side: keyof Prompts },
    signal: AbortSignal,
  ) => Promise<{ blocks: PromptProposal[] }>;
}
export function validateProposals(value: unknown): PromptProposal[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { blocks?: unknown }).blocks)
  )
    throw Error("Invalid proposal");
  const blocks = (value as { blocks: unknown[] }).blocks;
  if (!blocks.length || blocks.length > 20)
    throw Error("Invalid proposal count");
  let size = 0;
  return blocks.map((item) => {
    const p = item as Partial<PromptProposal> | null;
    if (
      !p ||
      typeof p.title !== "string" ||
      typeof p.text !== "string" ||
      !p.text.trim() ||
      p.text.length > 20000 ||
      !["positive", "negative"].includes(p.side || "")
    )
      throw Error("Invalid proposal");
    size += p.text.length;
    if (size > 80000) throw Error("Proposal too large");
    return { title: cleanTitle(p.title), text: p.text, side: p.side! };
  });
}
export function applyProposals(
  values: Prompts,
  blocks: PromptProposal[],
): Prompts {
  const next = { ...values };
  for (const block of blocks)
    next[block.side] = appendNamedBlock(
      next[block.side],
      block.title,
      block.text,
    );
  return next;
}
