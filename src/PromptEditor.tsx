import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Undo2, Redo2, Sparkles } from "lucide-react";
import { Modal } from "./components";
import { insertTag, tagRange, type Tag } from "./tags";
import { caretPosition } from "./caret";
type Side = "positive" | "negative";
type Prompts = Record<Side, string>;
const categories: Record<number, string> = { 0: "Général", 1: "Artiste", 3: "Univers", 4: "Personnage", 5: "Méta" };
export default function PromptEditor({ initialTab, values, onChange, onClose }: { initialTab: Side; values: Prompts; onChange: (values: Prompts) => void; onClose: () => void }) {
  const [side, setSide] = useState(initialTab), [caret, setCaret] = useState(values[initialTab].length), [tags, setTags] = useState<Tag[]>([]), [active, setActive] = useState(0), [count, setCount] = useState(0), [error, setError] = useState(""), [composing, setComposing] = useState(false), [dismissed, setDismissed] = useState(false);
  const [enabled, setEnabled] = useState(() => localStorage.getItem("autocomplete-enabled") !== "false"), [pending, setPending] = useState(false);
  const bubbleVisible = enabled && !dismissed && !!tagRange(values[side], caret).query;
  const input = useRef<HTMLTextAreaElement>(null), worker = useRef<Worker | null>(null), sequence = useRef(0), history = useRef<{ undo: Prompts[]; redo: Prompts[] }>({ undo: [], redo: [] });
  const value = values[side], query = tagRange(value, caret).query;
  const bubble = useRef<HTMLDivElement>(null), [bubbleTop, setBubbleTop] = useState(60), [scroll, setScroll] = useState(0);
  const placeBubble = () => {
    const field = input.current; if (!field || !bubbleVisible) return;
    let top = caretPosition(field, caret) + 8;
    const available = field.clientHeight - 112;
    if (top > available) { field.scrollTop += top - Math.max(38, available); top = caretPosition(field, caret) + 8; }
    setBubbleTop(Math.max(0, top));
  };
  useLayoutEffect(placeBubble, [caret, value, bubbleVisible, scroll]);
  useEffect(() => { const observer = new ResizeObserver(placeBubble); if (input.current) observer.observe(input.current); return () => observer.disconnect(); }, [caret, bubbleVisible]);
  useEffect(() => {
    if (!enabled) return;
    const w = new Worker(new URL("./tags.worker.ts", import.meta.url), { type: "module" }); worker.current = w;
    w.onmessage = event => { const data = event.data; if (data.ready) setCount(data.ready); if (data.error) { setError(data.error); setPending(false); setTags([]); } if (data.id === sequence.current) { setTags(data.tags); setActive(0); setPending(false); } };
    w.onerror = () => { setError("Suggestions indisponibles. La saisie reste disponible."); setPending(false); setTags([]); };
    return () => { worker.current = null; w.terminate(); };
  }, [enabled]);
  useEffect(() => {
    const viewport = window.visualViewport, el = input.current?.closest("dialog");
    const resize = () => { el?.style.setProperty("--editor-height", `${viewport?.height ?? innerHeight}px`); el?.style.setProperty("--editor-top", `${viewport?.offsetTop ?? 0}px`); };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    return () => { viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize); };
  }, []);
  useEffect(() => { input.current?.focus(); input.current?.setSelectionRange(caret, caret); }, [side]);
  useEffect(() => {
    const id = ++sequence.current;
    if (!enabled || !query || dismissed) { setTags([]); setPending(false); return; }
    if (composing) return;
    setPending(true);
    const timer = setTimeout(() => worker.current?.postMessage({ id, query }), 65);
    return () => clearTimeout(timer);
  }, [query, composing, side, dismissed, enabled]);
  const update = (next: Prompts) => { history.current.undo.push({ ...values }); if (history.current.undo.length > 80) history.current.undo.shift(); history.current.redo = []; onChange(next); setDismissed(false); };
  const select = (tag: Tag) => {
    if (pending) return;
    const next = insertTag(value, caret, tag.name); update({ ...values, [side]: next.text }); setCaret(next.caret); setTags([]);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next.caret, next.caret); });
  };
  const travel = (direction: "undo" | "redo") => {
    const from = history.current[direction], next = from.pop(); if (!next) return;
    history.current[direction === "undo" ? "redo" : "undo"].push({ ...values }); onChange(next); setCaret(next[side].length); setDismissed(false);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(next[side].length, next[side].length); });
  };
  return <Modal title="Écrire votre image" className="prompt-editor" onClose={onClose}>
    <label className="autocomplete-setting"><span>Autocomplétion</span><input type="checkbox" role="switch" aria-label="Activer l’autocomplétion" checked={enabled} onChange={e => { setEnabled(e.target.checked); localStorage.setItem("autocomplete-enabled", String(e.target.checked)); }} /></label>
    <div className="editor-tabs" role="tablist" aria-label="Type de prompt">{(["positive", "negative"] as Side[]).map((s, i) => <button key={s} id={`tab-${s}`} role="tab" aria-selected={side === s} aria-controls="prompt-panel" tabIndex={side === s ? 0 : -1} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "positive" : e.key === "End" ? "negative" : s === "positive" ? "negative" : "positive"; setSide(next); setCaret(values[next].length); setDismissed(false); } }} onClick={() => { setSide(s); setCaret(values[s].length); setDismissed(false); }}><span>0{i + 1}</span>{s === "positive" ? "Positif" : "Négatif"}<small>{values[s].length}</small></button>)}</div>
    <div className="editor-paper" role="tabpanel" id="prompt-panel" aria-labelledby={`tab-${side}`}><label className="sr-only" htmlFor="prompt-text">{side === "positive" ? "Prompt positif" : "Prompt négatif"}</label><textarea id="prompt-text" ref={input} value={value} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-autocomplete="list" aria-controls="tag-suggestions" aria-activedescendant={bubbleVisible && tags.length ? `tag-${active}` : undefined} placeholder={side === "positive" ? "Imaginez la scène. Ajoutez des tags, des détails, une lumière…" : "Décrivez les éléments que vous souhaitez éviter…"} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={e => { update({ ...values, [side]: e.target.value }); setCaret(e.target.selectionStart); }} onScroll={e => setScroll(e.currentTarget.scrollTop)} onSelect={e => setCaret(e.currentTarget.selectionStart)} onKeyDown={e => {
      if (composing || e.nativeEvent.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) { e.preventDefault(); travel(e.shiftKey || e.key.toLowerCase() === "y" ? "redo" : "undo"); return; }
      if (!enabled || pending || !tags.length) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissed(true); setTags([]); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive(n => (n + (e.key === "ArrowDown" ? 1 : tags.length - 1)) % tags.length); }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") { e.preventDefault(); select(tags[active]); }
    }} />
    <div ref={bubble} hidden={!bubbleVisible} className="suggestion-bubble" aria-busy={pending} style={{ top: bubbleTop }}><div className="suggestion-heading"><span><Sparkles size={14} /> Danbooru</span><small>{error ? "Saisie libre" : count ? `${count.toLocaleString("fr-FR")} tags · hors ligne` : "Préparation des tags…"}</small></div><div role="listbox" id="tag-suggestions" aria-label="Suggestions de tags" className="tag-suggestions">{tags.map((tag, i) => <div role="option" id={`tag-${i}`} key={tag.name} aria-selected={active === i} aria-disabled={pending} className={`tag-option ${active === i ? "highlighted" : ""}`} onPointerDown={e => e.preventDefault()} onClick={() => select(tag)}><span className={`tag-dot category-${tag.category}`} /><span><strong>{tag.name.replace(/_/g, " ")}</strong><small>{categories[tag.category]} · {tag.count.toLocaleString("fr-FR")}</small></span><span className="tag-add" aria-hidden="true">+</span></div>)}{!tags.length && <span className="suggestion-empty">{pending ? "Recherche de tags…" : "Aucun tag correspondant"}</span>}</div></div></div><p className="editor-hint" role="status">{!enabled ? "Autocomplétion désactivée" : error || (count ? `${count.toLocaleString("fr-FR")} tags · suggestions hors ligne` : "Préparation des suggestions…")}</p>
    <footer className="editor-footer"><div><button aria-label="Annuler la dernière modification" disabled={!history.current.undo.length} onClick={() => travel("undo")}><Undo2 size={19} /></button><button aria-label="Rétablir la modification" disabled={!history.current.redo.length} onClick={() => travel("redo")}><Redo2 size={19} /></button></div><button className="primary" onClick={onClose}><Check size={18} /> Terminé</button></footer>
  </Modal>;
}
