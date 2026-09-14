import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image as ImageIcon, Search, X, Check, Heart } from "lucide-react";
import { imageUrl, api, type GalleryItem } from "./api";

export const shortName = (s: string) => s.split(/[\\/]/).pop()!.replace(/\.(safetensors|ckpt|pt|pth)$/i, "").replace(/_/g, " ");
export const modelPath = (kind: string, name: string) => "/bridge/model-preview?" + new URLSearchParams({ kind, name });
const cache = new Map<string, string>();
export function clearImageCache() { cache.clear(); }
export function Picture({ path, alt, onOpen, thumbnail = false, source, small = false }: { path: string; alt: string; onOpen?: (url: string) => void; thumbnail?: boolean; source?: string; small?: boolean }) {
  const [url, setUrl] = useState(""), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true; setUrl(""); setError(false);
    if (source) { setUrl(source); return; }
    const obs = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return; obs.disconnect();
      const requestPath = small ? path + (path.includes("?") ? "&" : "?") + "thumb=1" : path;
      const saved = cache.get(requestPath);
      (saved ? Promise.resolve(saved) : imageUrl(requestPath)).then(u => {
        if (!live) return;
        if (cache.size >= 30) cache.delete(cache.keys().next().value!);
        cache.set(requestPath, u); setUrl(u);
      }).catch(() => { if (live) setError(true); });
    }, { rootMargin: "150px" });
    if (ref.current) obs.observe(ref.current);
    return () => { live = false; obs.disconnect(); };
  }, [path, attempt, source, small]);
  const content = url ? <img src={url} alt={alt} loading="lazy" draggable={false} /> : <span className="image-placeholder"><ImageIcon size={thumbnail ? 24 : 32} />{!thumbnail && <small>{error ? "Image indisponible" : "Chargement…"}</small>}</span>;
  return <div ref={ref} className={thumbnail ? "picture thumbnail" : "picture"}>{onOpen && url ? <button className="image-button" onClick={() => onOpen(small ? "" : url)} aria-label={`Agrandir ${alt}`}>{content}</button> : content}{error && !thumbnail && <button className="retry-image" onClick={() => setAttempt(a => a + 1)}>Réessayer</button>}</div>;
}
export function Modal({ title, onClose, children, className = "" }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; before?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className={className} onCancel={e => { e.preventDefault(); onClose(); }}><header className="modal-head"><h2>{title}</h2><button aria-label="Fermer" onClick={onClose}><X size={21} /></button></header>{children}</dialog>;
}
export function ModelPicker({ title, kind, names, value, onSelect, onClose }: { title: string; kind: string; names: string[]; value: string; onSelect: (name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState(""), [limit, setLimit] = useState(60), [onlyFavorites, setOnlyFavorites] = useState(false), [favorites, setFavorites] = useState<string[]>([]), [ready, setReady] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => { let live = true; api<Record<string, string[]>>("/bridge/model-favorites").then(data => { if (live) { setFavorites(data[kind] ?? []); setReady(true); } }).catch(() => { if (live) setError("Favoris indisponibles. Redémarrez le compagnon PC avec cette version."); }); return () => { live = false; }; }, [kind]);
  const favorite = async (name: string) => {
    if (lock.current || !ready) return; lock.current = true; setSaving(true); setError("");
    try { const data = await api<Record<string, string[]>>("/bridge/model-favorites", { kind, name, favorite: !favorites.includes(name) }); setFavorites(data[kind] ?? []); }
    catch { setError("Le favori n’a pas pu être enregistré sur le PC."); }
    finally { lock.current = false; setSaving(false); }
  };
  const filtered = names.filter(n => n.toLowerCase().includes(search.toLowerCase()) && (!onlyFavorites || favorites.includes(n)));
  return <Modal title={title} onClose={onClose} className="model-dialog"><label className="search-box"><Search size={19} /><input autoFocus aria-label="Rechercher un modèle" placeholder="Nom du modèle…" value={search} onChange={e => { setSearch(e.target.value); setLimit(60); }} /></label><div className="model-filter"><span className="muted">{filtered.length} disponibles</span><button aria-pressed={onlyFavorites} disabled={!ready} onClick={() => { setOnlyFavorites(v => !v); setLimit(60); }}><Heart size={16} fill={onlyFavorites ? "currentColor" : "none"} /> Favoris</button></div>{error && <p role="alert" className="hint">{error}</p>}<div className="model-list">{filtered.slice(0, limit).map(name => <div key={name} className={`model-card ${name === value ? "selected" : ""}`}><button className="model-choice" onClick={() => { onSelect(name); onClose(); }}><Picture path={modelPath(kind, name)} alt="" thumbnail /><span><strong>{shortName(name)}</strong><small>{name}</small></span>{name === value && <Check size={20} />}</button><button className="model-star" aria-label={`${favorites.includes(name) ? "Retirer des favoris" : "Mettre en favori"} ${shortName(name)}`} aria-pressed={favorites.includes(name)} disabled={!ready || saving} onClick={() => void favorite(name)}><Heart size={20} fill={favorites.includes(name) ? "currentColor" : "none"} /></button></div>)}</div>{filtered.length > limit && <button className="wide" onClick={() => setLimit(n => n + 60)}>Afficher la suite</button>}{!filtered.length && <p>{onlyFavorites ? "Marquez vos modèles avec le cœur pour les retrouver ici." : "Aucun modèle ne correspond à cette recherche."}</p>}</Modal>;
}
export interface ViewItem { path: string; name: string; url?: string; gallery?: GalleryItem }
export { default as Viewer } from "./Viewer";
