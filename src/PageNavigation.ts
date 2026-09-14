import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type MouseEvent } from "react";
export const pages = ["create", "gallery", "glossary", "connect"] as const;
export type Page = typeof pages[number];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export function usePageNavigation() {
  const [tab, commit] = useState<Page>("connect"), trackRef = useRef<HTMLDivElement>(null), current = useRef<Page>("connect");
  const offset = useRef(0), animation = useRef<Animation | null>(null), moving = useRef(false);
  const requested = useRef<Page>("connect");
  const pointer = useRef<{ id: number; x: number; y: number; horizontal: boolean; time: number } | null>(null), suppress = useRef(false);
  const paint = (x: number) => { offset.current = x; if (trackRef.current) trackRef.current.style.transform = `translate3d(${x}px,0,0)`; };
  const reset = () => { animation.current?.cancel(); animation.current = null; moving.current = false; paint(0); };
  useLayoutEffect(() => {
    current.current = tab; reset(); pointer.current = null;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (requested.current !== tab) queueMicrotask(() => setTab(requested.current));
  }, [tab]);
  useLayoutEffect(() => () => { animation.current?.cancel(); }, []);
  const setTab = useCallback((next: Page) => {
    requested.current = next;
    if (moving.current || next === current.current) return;
    const el = trackRef.current;
    pointer.current = null;
    if (!el || reduced()) { commit(next); return; }
    animation.current?.cancel(); moving.current = true;
    const distance = pages.indexOf(next) - pages.indexOf(current.current);
    const a = el.animate([{ transform: `translate3d(${offset.current}px,0,0)` }, { transform: `translate3d(${-distance * el.clientWidth}px,0,0)` }], { duration: 260, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" });
    animation.current = a;
    // Keep the final transform until React commits both pane positions, before paint.
    void a.finished.then(() => commit(next)).catch(() => {});
  }, []);
  const cancel = () => {
    pointer.current = null;
    if (!offset.current || moving.current) return;
    const a = trackRef.current?.animate([{ transform: `translate3d(${offset.current}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: reduced() ? 0 : 160, easing: "ease-out", fill: "forwards" });
    animation.current = a ?? null; moving.current = true;
    void a?.finished.then(reset).catch(() => {});
  };
  const handlers = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      suppress.current = false;
      if (moving.current || !e.isPrimary || e.button !== 0 || (e.target as Element).closest("input,textarea,select,summary,a,dialog,[role=slider],.result-strip,.gallery-grid,button")) return;
      suppress.current = false; pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, horizontal: false, time: performance.now() };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const p = pointer.current; if (!p || p.id !== e.pointerId) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.horizontal && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { cancel(); return; }
      if (!p.horizontal && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) { p.horizontal = true; e.currentTarget.setPointerCapture(e.pointerId); }
      if (p.horizontal) { suppress.current = true; const edge = current.current === "create" && dx > 0 || current.current === "connect" && dx < 0; paint(dx * (edge ? .15 : 1)); }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      setTimeout(() => { suppress.current = false; }, 0);
      const p = pointer.current; if (!p) return;
      const dx = e.clientX - p.x, next = pages[pages.indexOf(current.current) + (dx < 0 ? 1 : -1)];
      const velocity = Math.abs(dx) / Math.max(1, performance.now() - p.time);
      if (p.horizontal && next && (Math.abs(dx) > 70 || Math.abs(dx) > 30 && velocity > .5)) setTab(next); else cancel();
    },
    onPointerCancel: cancel,
    onClickCapture: (e: MouseEvent<HTMLElement>) => { if (suppress.current) { e.preventDefault(); e.stopPropagation(); suppress.current = false; } },
  };
  const setInitialTab = useCallback((next: Page) => {
    if (requested.current === "connect" && current.current === "connect" && !moving.current) setTab(next);
  }, [setTab]);
  return { tab, setTab, setInitialTab, handlers, trackRef };
}
