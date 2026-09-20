import { t as tr } from "./i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";
export { parsePairing } from "./pairing";
export interface Pairing {
  url: string;
  token: string;
  certificate: string;
}
export interface NodeDef {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}
export type Workflow = Record<string, NodeDef>;
export interface ImageRef {
  filename: string;
  subfolder: string;
  type: string;
}
export interface GalleryItem {
  favorite?: boolean;
  root: number;
  relative: string;
  name: string;
  folder: string;
  size: number;
  modified: number;
}
export interface Gallery {
  items: GalleryItem[];
  total: number;
  warnings: string[];
}
export interface NodeInfo {
  input: {
    required: Record<string, unknown[]>;
    optional?: Record<string, unknown[]>;
  };
}
export type ObjectInfo = Record<string, NodeInfo>;
export interface HistoryEntry {
  outputs: Record<string, { images?: ImageRef[] }>;
  status?: {
    status_str: string;
    completed: boolean;
    messages?: [string, Record<string, unknown>][];
  };
  prompt?: unknown[];
}
export type History = Record<string, HistoryEntry>;
export interface Queue {
  queue_running: [number, string, ...unknown[]][];
  queue_pending: [number, string, ...unknown[]][];
}
export interface Stats {
  system?: { ram_total?: number; ram_free?: number };
  devices: { name: string; vram_total: number; vram_free: number }[];
}
export interface Event {
  seq: number;
  type: string;
  data: Record<string, unknown> | string;
}
export async function native<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (isTauri()) return invoke<T>(command, args);
  // Development/test adapter is only served by the explicitly enabled local test harness.
  const r = await fetch("/__native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, args }),
  });
  if (!r.ok)
    throw new Error(tr("Ouvrez l’application Tauri pour connecter votre PC."));
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.value;
}
export const api = <T>(path: string, body?: unknown) =>
  native<T>("api", { path, body: body ?? null });
export const imageUrl = (path: string) => native<string>("image", { path });
export function imagePath(i: ImageRef) {
  return (
    "/api/view?" +
    new URLSearchParams({
      filename: i.filename,
      subfolder: i.subfolder ?? "",
      type: i.type ?? "output",
    })
  );
}
export function galleryPath(i: GalleryItem) {
  return (
    "/bridge/file?" +
    new URLSearchParams({ root: String(i.root), relative: i.relative, revision: `${i.modified}-${i.size}` })
  );
}
export function choices(
  info: ObjectInfo,
  node: string,
  field: string,
): string[] {
  const definition = info[node]?.input?.required?.[field] ?? info[node]?.input?.optional?.[field];
  const options = definition?.[1] as { options?: unknown } | undefined;
  const value = definition?.[0] === "COMBO" ? options?.options : definition?.[0];
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
