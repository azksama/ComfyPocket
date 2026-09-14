import { normalizeSettings, parseWorkflow, type Settings } from "./workflow";
import type { Workflow } from "./api";
export interface InferencePreset { id: string; name: string; createdAt: number; settings: Settings; mode: "simple" | "workflow"; workflow: Workflow | null }
const key = "inference-presets-v1";
export function parsePreset(input: unknown): InferencePreset {
  if (!input || typeof input !== "object") throw Error("Preset invalide.");
  const p = input as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 80 || !p.settings || typeof p.settings !== "object" || !["simple", "workflow"].includes(String(p.mode))) throw Error("Le preset doit contenir un titre et des paramètres d’inférence.");
  return { id: typeof p.id === "string" && p.id.length < 100 ? p.id : crypto.randomUUID(), name: p.name.trim(), createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(), settings: normalizeSettings(p.settings), mode: p.mode as "simple" | "workflow", workflow: p.mode === "workflow" ? parseWorkflow(JSON.stringify(p.workflow)) : null };
}
export function readPresets(): InferencePreset[] {
  const value = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(value) || value.length > 100) throw Error("Bibliothèque de presets invalide.");
  return value.map(parsePreset);
}
export function writePresets(presets: InferencePreset[]) {
  if (presets.length > 100) throw Error("Vous pouvez mémoriser jusqu’à 100 presets.");
  // Write before updating the UI: storage failures must not look like a successful save.
  localStorage.setItem(key, JSON.stringify(presets));
}
