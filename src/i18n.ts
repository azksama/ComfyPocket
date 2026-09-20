import { useSyncExternalStore } from "react";
import english from "./locales/en.json";
export type Locale = "fr" | "en";
let language: Locale = "fr";
try {
  if (localStorage.getItem("mochi-language") === "en") language = "en";
} catch {
  /* Session preference remains available. */
}
const listeners = new Set<() => void>();
export const locale = () => language;
export function useLocale() {
  return useSyncExternalStore((callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, locale);
}
export function setLocale(next: Locale) {
  localStorage.setItem("mochi-language", next);
  language = next;
  document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
if (typeof document !== "undefined") document.documentElement.lang = language;
export function t(source: string, values: readonly unknown[] = []): string {
  const translated =
    language === "en"
      ? ((english as Record<string, string>)[source] ?? source)
      : source;
  return translated.replace(/\{(\d+)\}/g, (match, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}
