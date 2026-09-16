import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Heart, Trash2, Download, SlidersHorizontal } from "lucide-react";
import { imageUrl, native } from "./api";
import { Modal, type ViewItem } from "./components";
type Point = { x: number; y: number };
type Pose = Point & { scale: number };
const origin: Pose = { x: 0, y: 0, scale: 1 };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const duration = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230;
export default function Viewer({ items, index, onIndex, onClose, onFavorite, onTrash, onReuse, onMore }: { items: ViewItem[]; index: number; onIndex: (n: number) => void; onClose: () => void; onFavorite: (item: ViewItem, favorite: boolean) => Promise<void>; onTrash: (item: ViewItem) => Promise<void>; onReuse: (item: ViewItem, url: string) => Promise<void>; onMore?: () => Promise<ViewItem[]> }) {
  const item = items[index], [urls, setUrls] = useState<Record<string, string>>({}), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [pose, setPose] = useState<Pose>(origin), [drag, setDrag] = useState<Point>({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement>(null), rail = useRef<HTMLDivElement>(null), image = useRef<HTMLImageElement>(null), poseRef = useRef(origin), points = useRef(new Map<number, Point>()), gesture = useRef<{ start: Point; pose: Pose; pinch?: { center: Point; distance: number }; axis?: "x" | "y"; multiple: boolean } | null>(null);
  const loaded = useRef(new Map<string, string>()), pending = useRef(new Map<string, Promise<string>>()), lock = useRef(false), alive = useRef(true), entering = useRef<Point | null>(null), previousTap = useRef(0);
  const handoff = useRef<Animation | null>(null), keep = useRef(new Set<string>());
  const url = item && (item.url || urls[item.path]) || "";
  useEffect(() => { alive.current = true; return () => { alive.current = false; handoff.current?.cancel(); }; }, []);
  const setView = (next: Pose) => { poseRef.current = next; setPose(next); };
  function clamp(next: Pose): Pose {
    const box = stage.current?.getBoundingClientRect(), img = image.current;
    if (!box || !img?.naturalWidth) return next;
    const ratio = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    const x = Math.max(0, (img.naturalWidth * ratio * next.scale - box.width) / 2), y = Math.max(0, (img.naturalHeight * ratio * next.scale - box.height) / 2);
    return { scale: next.scale, x: Math.max(-x, Math.min(x, next.x)), y: Math.max(-y, Math.min(y, next.y)) };
  }
  async function fetchItem(current: ViewItem, required = false) {
    if (loaded.current.has(current.path)) return loaded.current.get(current.path)!;
    let task = pending.current.get(current.path);
    if (!task) {
      task = (async () => { const value = current.url || await imageUrl(current.path); const decoded = new Image(); decoded.src = value; await decoded.decode(); return value; })();
      pending.current.set(current.path, task);
    }
    try {
      const value = await task;
      if (alive.current && (required || keep.current.has(current.path))) {
        if (required) {
          keep.current.add(current.path);
          // An explicitly opened image takes priority over speculative neighbours.
          for (const key of loaded.current.keys()) if (key !== item.path && key !== current.path) loaded.current.delete(key);
        }
        const size = [...loaded.current.values()].reduce((n, u) => n + u.length * 2, 0);
        if (required || current.path === item.path || size + value.length * 2 < 96 * 1024 ** 2) loaded.current.set(current.path, value);
        setUrls(Object.fromEntries(loaded.current));
      }
      return value;
    } finally { pending.current.delete(current.path); }
  }
  useEffect(() => {
    keep.current = new Set(items.slice(Math.max(0, index - 1), index + 2).map(i => i.path));
    for (const key of loaded.current.keys()) if (!keep.current.has(key)) loaded.current.delete(key);
    let live = true;
    if (item) void fetchItem(item).then(async current => {
      if (!live || current.length > 24 * 1024 ** 2) return;
      for (const neighbour of [items[index + 1], items[index - 1]]) if (live && neighbour) await fetchItem(neighbour).catch(() => {});
    }).catch(() => { if (live) setMessage("Image indisponible. Fermez puis rouvrez l’image pour réessayer."); });
    return () => { live = false; };
  }, [item?.path, index, items.length]);
  useLayoutEffect(() => {
    // Reset the rail only after the new item and stable image keys are committed.
    handoff.current?.cancel(); handoff.current = null;
    setView(origin); setDrag({ x: 0, y: 0 }); setMessage(""); points.current.clear(); gesture.current = null;
    const entry = entering.current; entering.current = null;
    if (entry && rail.current) rail.current.animate([{ transform: `translate(${entry.x}px, ${entry.y}px)` }, { transform: "translate(0,0)" }], { duration: duration(), easing: "cubic-bezier(.22,.68,.2,1)" });
  }, [item?.path]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setMessage("");
    try { await fn(); } catch (e) { if (alive.current) setMessage(String(e)); }
    finally { lock.current = false; if (alive.current) { setBusy(false); setDrag({ x: 0, y: 0 }); } }
  };
  async function animateTo(target: Point) {
    const animation = rail.current?.animate([{ transform: `translate(${drag.x}px,${drag.y}px)` }, { transform: `translate(${target.x}px,${target.y}px)` }], { duration: duration(), easing: "cubic-bezier(.22,.68,.2,1)", fill: "forwards" });
    if (animation) await animation.finished.catch(() => {});
    return animation;
  }
  const move = (delta: number) => void run(async () => {
    const next = index + delta;
    if (next < 0 || next >= items.length && !onMore) { setDrag({ x: 0, y: 0 }); return; }
    const available = next === items.length ? await onMore!() : items;
    const destination = available[next];
    if (!destination || !alive.current) return;
    await fetchItem(destination, true);
    if (!alive.current) return;
    const animation = await animateTo({ x: 0, y: -delta * (stage.current?.clientHeight ?? innerHeight) });
    // The rail already contains decoded neighbouring images, avoiding a blank frame.
    handoff.current = animation ?? null; onIndex(next);
  });
  const horizontal = (remove: boolean) => void run(async () => {
    if (!item.gallery) return;
    if (remove) {
      const following = items[index + 1] ?? items[index - 1]; if (following) await fetchItem(following, true);
      const animation = await animateTo({ x: -(stage.current?.clientWidth ?? innerWidth), y: 0 });
      try { handoff.current = animation ?? null; entering.current = { x: 0, y: stage.current?.clientHeight ?? innerHeight }; await onTrash(item); }
      catch (e) { entering.current = null; animation?.cancel(); handoff.current = null; throw e; }
    } else {
      await onFavorite(item, true);
      const animation = await animateTo({ x: 0, y: 0 }); animation?.cancel();
    }
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); move(e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1); }
      if (e.key.toLowerCase() === "f" && item?.gallery) { e.preventDefault(); void run(() => onFavorite(item, !item.gallery?.favorite)); }
      if (e.key === "0") setView(origin);
      if (e.key === "+" || e.key === "=") setView(clamp({ ...poseRef.current, scale: Math.min(5, poseRef.current.scale + 0.5) }));
      if (e.key === "-") setView(clamp({ ...poseRef.current, scale: Math.max(1, poseRef.current.scale - 0.5) }));
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  });
  if (!item) return null;
  return <Modal title="Votre image" onClose={onClose} className="photo-viewer"><div className="viewer-stage" ref={stage} data-scale={pose.scale.toFixed(2)} onDoubleClick={() => setView(origin)} onWheel={e => { if (e.ctrlKey || poseRef.current.scale > 1) setView(clamp({ ...poseRef.current, scale: Math.min(5, Math.max(1, poseRef.current.scale - e.deltaY * .005)) })); }}
    onPointerDown={e => {
      if (busy || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId); points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const values = [...points.current.values()];
      if (values.length === 1) gesture.current = { start: values[0], pose: poseRef.current, multiple: false };
      else if (values.length === 2) { setDrag({ x: 0, y: 0 }); gesture.current = { start: values[0], pose: poseRef.current, multiple: true, pinch: { distance: distance(values[0], values[1]), center: middle(values[0], values[1]) } }; }
    }}
    onPointerMove={e => {
      if (!points.current.has(e.pointerId) || !gesture.current) return;
      points.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const g = gesture.current, values = [...points.current.values()];
      if (values.length >= 2 && g.pinch) {
        const scale = Math.min(5, Math.max(1, g.pose.scale * distance(values[0], values[1]) / Math.max(1, g.pinch.distance))), mid = middle(values[0], values[1]), box = e.currentTarget.getBoundingClientRect(), ratio = scale / g.pose.scale;
        setView(clamp({ scale, x: mid.x - box.left - box.width / 2 - (g.pinch.center.x - box.left - box.width / 2 - g.pose.x) * ratio, y: mid.y - box.top - box.height / 2 - (g.pinch.center.y - box.top - box.height / 2 - g.pose.y) * ratio })); return;
      }
      const x = e.clientX - g.start.x, y = e.clientY - g.start.y;
      if (g.pose.scale > 1) { setView(clamp({ ...g.pose, x: g.pose.x + x, y: g.pose.y + y })); return; }
      if (g.multiple) return;
      if (!g.axis && Math.hypot(x, y) > 12) g.axis = Math.abs(x) > Math.abs(y) * 1.2 ? "x" : "y";
      setDrag(g.axis === "y" ? { x: 0, y: (index === 0 && y > 0 || index === items.length - 1 && !onMore && y < 0) ? y * .2 : y } : { x: item.gallery ? x : x * .2, y: 0 });
    }}
    onPointerCancel={e => { points.current.delete(e.pointerId); gesture.current = null; setDrag({ x: 0, y: 0 }); }}
    onPointerUp={e => {
      const g = gesture.current; points.current.delete(e.pointerId);
      if (points.current.size) { gesture.current = { start: [...points.current.values()][0], pose: poseRef.current, multiple: true }; return; }
      gesture.current = null; if (!g) return;
      const x = e.clientX - g.start.x, y = e.clientY - g.start.y;
      if (!g.multiple && Math.hypot(x, y) < 8) { const now = performance.now(); if (now - previousTap.current < 300) setView(origin); previousTap.current = now; }
      if (g.multiple || g.pose.scale > 1) { setDrag({ x: 0, y: 0 }); return; }
      if (g.axis === "y" && Math.abs(y) > 70) move(y < 0 ? 1 : -1);
      else if (g.axis === "x" && Math.abs(x) > 100 && item.gallery) horizontal(x < 0);
      else { void animateTo({ x: 0, y: 0 }).then(a => { a?.cancel(); if (alive.current) setDrag({ x: 0, y: 0 }); }); }
    }}>
    <div className="viewer-rail" ref={rail} style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}>{[-1, 0, 1].map(offset => {
      const neighbour = items[index + offset], src = neighbour && (neighbour.url || urls[neighbour.path]);
      return <div key={neighbour?.path ?? `empty-${offset}`} className="viewer-slide" aria-hidden={offset !== 0} style={{ top: `${offset * 100}%`, visibility: pose.scale > 1 && offset !== 0 ? "hidden" : undefined }}>{src ? <img ref={offset === 0 ? image : undefined} className={offset === 0 ? "full-image" : "adjacent-image"} src={src} alt={offset === 0 ? item.name : ""} draggable={false} style={offset === 0 ? { transform: `translate(${pose.x}px,${pose.y}px) scale(${pose.scale})` } : undefined} /> : offset === 0 ? <span>Chargement de l’image…</span> : null}</div>;
    })}</div></div>
    <div className="gesture-action" hidden={!item.gallery || Math.abs(drag.x) < 12 || pose.scale > 1} data-action={drag.x < 0 ? "trash" : "favorite"} role="img" aria-label={drag.x < 0 ? "Déplacer dans la corbeille" : "Mettre en favori"} style={{ opacity: Math.min(1, Math.abs(drag.x) / 100), transform: `scale(${.65 + Math.min(1, Math.abs(drag.x) / 100) * .35})` }}>{drag.x < 0 ? <Trash2 size={34} /> : <Heart size={34} fill="currentColor" />}</div>
    <div className="viewer-caption"><span>{index + 1} / {items.length}{onMore ? "+" : ""}</span><span title={item.name}>{item.name}</span></div>
    <div className="viewer-actions"><button aria-label={item.gallery?.favorite ? "Retirer des favoris" : "Mettre en favori"} aria-pressed={!!item.gallery?.favorite} disabled={busy || !item.gallery} onClick={() => void run(() => onFavorite(item, !item.gallery?.favorite))}><Heart fill={item.gallery?.favorite ? "currentColor" : "none"} /></button><button aria-label="Enregistrer sur cet appareil" disabled={busy || !url} onClick={() => void run(async () => { setMessage(await native<string>("save_image", { dataUrl: url, filename: item.name })); })}><Download /></button><button aria-label="Réutiliser les paramètres" disabled={busy || !url} onClick={() => void run(() => onReuse(item, url))}><SlidersHorizontal /></button><button aria-label="Déplacer dans la corbeille" disabled={busy || !item.gallery} onClick={() => horizontal(true)}><Trash2 /></button></div>
    <p role="status" className="viewer-message">{busy ? "Traitement…" : message}</p>
  </Modal>;
}
