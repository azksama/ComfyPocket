import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Images, Settings as SettingsIcon, BookOpen, RefreshCw, X, Monitor, LoaderCircle, FolderOpen, Heart, Search, ArrowUpRight, Trash2, RotateCcw, Upload, ChevronDown } from "lucide-react";
import { api, native, imagePath, galleryPath, choices, type Gallery, type GalleryItem, type ObjectInfo, type Stats, type Queue, type History, type Event, type Workflow } from "./api";
import { buildWorkflow, defaults, normalizeSettings, parseWorkflow, checkWorkflow, MAX_SEED, seedValue, type Settings } from "./workflow";
import { importImage, resolveImport, type Imported } from "./metadata";
import { Picture, Viewer, clearImageCache, type ViewItem } from "./components";
import CollapsibleCard from "./CollapsibleCard";
import SettingsPanel from "./SettingsPanel";
import Connections from "./Connections";
import Glossary from "./Glossary";
import Presets from "./Presets";
import { usePageNavigation, pages, type Page } from "./PageNavigation";
import ConnectionStatus from "./ConnectionStatus";
import GalleryGrid from "./GalleryGrid";
import Toast from "./Toast";

const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
const clientId = localStorage.getItem("clientId") ?? crypto.randomUUID();
localStorage.setItem("clientId", clientId);
const bytesOf = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), c => c.charCodeAt(0));
const dataUrl = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file); });
type TrashItem = { id: string; root: number; name: string; relative: string; deleted: number };
type ViewerState = { items: ViewItem[]; index: number; fromGallery: boolean };
const emptyGallery: Gallery = { items: [], total: 0, warnings: [] };
export default function App() {
  const { tab, setTab, setInitialTab, handlers, trackRef } = usePageNavigation();
  const [server, setServer] = useState(""), [online, setOnline] = useState(false), [stats, setStats] = useState<Stats | null>(null), [info, setInfo] = useState<ObjectInfo>({});
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings(stored("settings", defaults)));
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<Queue>({ queue_running: [], queue_pending: [] }), [jobs, setJobs] = useState<string[]>([]), [progress, setProgress] = useState(0), [phase, setPhase] = useState("Prêt à créer"), [preview, setPreview] = useState(""), [lastSeed, setLastSeed] = useState("");
  const [results, setResults] = useState<ViewItem[]>([]), [viewer, setViewer] = useState<ViewerState | null>(null);
  const [columns, setColumns] = useState(() => { const n = stored<number>("gallery-columns", 2); return [2, 3, 4].includes(n) ? n : 2; });
  const [gallery, setGallery] = useState<Gallery>(emptyGallery), [galleryBusy, setGalleryBusy] = useState(false), [search, setSearch] = useState(""), [root, setRoot] = useState(""), [filter, setFilter] = useState<"all" | "favorites" | "trash">("all"), [roots, setRoots] = useState<{ id: number; name: string }[]>([]), [trash, setTrash] = useState<TrashItem[]>([]), [undo, setUndo] = useState<TrashItem | null>(null);
  const [custom, setCustom] = useState<Workflow | null>(null), [customText, setCustomText] = useState(""), [mode, setMode] = useState<"simple" | "workflow">("simple"), [imported, setImported] = useState<Imported | null>(null);
  const cursor = useRef(0), jobsRef = useRef<string[]>([]), submitLock = useRef(false), generation = useRef(0), galleryRequest = useRef(0), missing = useRef(new Map<string, number>());
  const [showConnection, setShowConnection] = useState(false);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => { localStorage.setItem("settings", JSON.stringify(settings)); if (server) localStorage.setItem("settings:" + server, JSON.stringify(settings)); }, [settings, server]);
  const track = useCallback((ids: string[], url: string) => { jobsRef.current = ids; setJobs(ids); if (url) localStorage.setItem("tasks:" + url, JSON.stringify(ids)); }, []);
  const hydrate = useCallback(async (url: string, initial = false) => {
    const [s, i, b] = await Promise.all([api<Stats>("/api/system_stats"), api<ObjectInfo>("/api/object_info"), api<{ version: number; roots: { id: number; name: string }[] }>("/bridge/info")]);
    if (b.version < 2) throw new Error("Mettez à jour le compagnon PC avec le lanceur de cette version.");
    const models = choices(i, "CheckpointLoaderSimple", "ckpt_name");
    const saved = normalizeSettings(stored("settings:" + url, stored("settings", defaults)));
    setSettings({ ...saved, model: models.includes(saved.model) ? saved.model : models[0] ?? "", sampler: choices(i, "KSampler", "sampler_name").includes(saved.sampler) ? saved.sampler : choices(i, "KSampler", "sampler_name")[0] ?? defaults.sampler });
    setStats(s); setInfo(i); setRoots(b.roots); setOnline(true); setServer(url); if (initial) setInitialTab("create"); else setTab("create");
    const old = stored<{ url: string; id: string } | null>("active", null);
    track(stored("tasks:" + url, old?.url === url ? [old.id] : []), url);
    setResults(stored("results:" + url, [])); setLastSeed(stored("seed:" + url, ""));
  }, [track]);
  useEffect(() => {
    let live = true;
    native<string | null>("restore").then(async url => { if (url && live) { try { await hydrate(url, true); } catch (e) { if (live) setError(String(e)); } } }).catch(e => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [hydrate]);
  function resetSession() {
    generation.current++; setEpoch(generation.current); cursor.current = 0; galleryRequest.current++; missing.current.clear();
    setServer(""); setOnline(false); setInfo({}); setStats(null); setRoots([]); setRoot(""); setGallery(emptyGallery); setTrash([]); setViewer(null); setResults([]); setPreview(""); setImported(null); setCustom(null); setCustomText(""); setMode("simple"); setProgress(0); setPhase("Prêt à créer"); track([], ""); clearImageCache(); setUndo(null);
  }
  async function connect(id: string) {
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setError(""); setNotice(""); resetSession();
    try { const url = await native<string>("activate_profile", { id }); await hydrate(url); setNotice("Connexion chiffrée établie avec votre PC."); }
    catch (e) { setError(String(e)); }
    finally { submitLock.current = false; setBusy(false); }
  }
  async function disconnect(already = false) {
    if (!already) await native("disconnect");
    resetSession(); setTab("connect");
  }
  useEffect(() => {
    if (!server) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    const version = generation.current;
    const valid = () => !stopped && version === generation.current;
    async function poll() {
      const polled = [...jobsRef.current];
      try {
        const [q, events] = await Promise.all([api<Queue>("/api/queue"), api<{ events: Event[]; seq: number; connected: boolean }>(`/bridge/events?clientId=${clientId}&after=${cursor.current}`)]);
        if (!valid()) return;
        setQueue(q); setOnline(true); cursor.current = events.seq;
        for (const e of events.events) {
          const d = typeof e.data === "string" ? null : e.data;
          if (e.type === "preview" && jobsRef.current.length && typeof e.data === "string") setPreview(e.data);
          if (d?.prompt_id && !jobsRef.current.includes(String(d.prompt_id))) continue;
          if (e.type === "progress" && d && jobsRef.current.length) { setProgress(Math.round(Number(d.value) / Number(d.max) * 100)); setPhase("Génération en cours"); }
          if (e.type === "executing" && d?.node && jobsRef.current.length) setPhase("Votre PC compose l’image");
        }
        const histories = await Promise.all(polled.map(async id => ({ id, entry: (await api<History>("/api/history/" + id))[id] })));
        if (!valid()) return;
        const done = new Set<string>(), found: ViewItem[] = [];
        let failed = false;
        for (const { id, entry } of histories) {
          if (entry?.status?.completed || entry?.status?.status_str === "error") {
            done.add(id);
            found.push(...Object.values(entry.outputs ?? {}).flatMap(o => (o.images ?? []).filter(i => i.type === "output").map(i => ({ path: imagePath(i), name: i.filename }))));
            if (entry.status.status_str === "error") { failed = true; setError(String(entry.status.messages?.find(m => m[0] === "execution_error")?.[1]?.exception_message ?? "Génération interrompue ou échouée.")); }
          } else if (!q.queue_running.some(j => j[1] === id) && !q.queue_pending.some(j => j[1] === id)) {
            const count = (missing.current.get(id) ?? 0) + 1; missing.current.set(id, count);
            if (count >= 3) { done.add(id); failed = true; setError("Une tâche a disparu de la file et de l’historique du PC."); }
          } else missing.current.delete(id);
        }
        if (done.size) {
          const remaining = jobsRef.current.filter(id => !done.has(id)); track(remaining, server);
          if (found.length) setResults(old => { const next = [...found, ...old].slice(0, 160); localStorage.setItem("results:" + server, JSON.stringify(next)); return next; });
          setPreview(""); setProgress(remaining.length ? 0 : failed ? 0 : 100);
          setPhase(remaining.length ? `${remaining.length} lot(s) restant(s)` : failed ? "Traitement terminé avec une erreur" : "Génération terminée");
        }
      } catch { if (valid()) { setOnline(false); if (jobsRef.current.length) setPhase("Connexion perdue · reprise automatique"); } }
      finally { if (!stopped) timer = setTimeout(poll, 1500); }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [server, epoch, track]);
  async function generate() {
    if (submitLock.current || !online) return;
    submitLock.current = true; setBusy(true); setError(""); setNotice("");
    const version = generation.current;
    try {
      const batchCount = mode === "workflow" ? 1 : settings.batches;
      if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 20) throw new Error("Nombre de lots : 1 à 20.");
      const builds: { workflow: Workflow; settings?: Settings }[] = [];
      for (let n = 0; n < batchCount; n++) {
        if (mode === "workflow") {
          if (!custom) throw new Error("Importez et validez un workflow API.");
          builds.push({ workflow: custom }); continue;
        }
        if (!choices(info, "CheckpointLoaderSimple", "ckpt_name").includes(settings.model)) throw new Error("Le modèle importé est absent de ce PC. Choisissez un modèle disponible.");
        const s = { ...settings, seed: settings.seed.trim() ? String((BigInt(seedValue(settings.seed)) + BigInt(n)) % (MAX_SEED + 1n)) : "" };
        const built = buildWorkflow(s); s.seed = String(built.seed); builds.push({ workflow: built.workflow, settings: s });
      }
      builds.forEach(b => checkWorkflow(b.workflow, info));
      await api(`/bridge/events?clientId=${clientId}&after=${cursor.current}`);
      setResults([]); localStorage.removeItem("results:" + server); setPreview(""); setProgress(0); setPhase("En attente du GPU"); window.scrollTo({ top: 0, behavior: "smooth" });
      for (const b of builds) {
        if (version !== generation.current) break;
        const response = await api<{ prompt_id?: string; error?: unknown; node_errors?: unknown }>("/api/prompt", { prompt: b.workflow, client_id: clientId, extra_data: { extra_pnginfo: b.settings ? { comfy_pocket: { version: 2, settings: b.settings } } : {} } });
        if (!response.prompt_id) throw new Error(JSON.stringify(response.error ?? response.node_errors ?? response));
        track([...jobsRef.current, response.prompt_id], server);
        if (b.settings) { setLastSeed(b.settings.seed); localStorage.setItem("seed:" + server, JSON.stringify(b.settings.seed)); }
      }
    } catch (e) { setError(String(e) + (jobsRef.current.length ? " Les lots déjà envoyés continuent." : "")); }
    finally { setBusy(false); submitLock.current = false; }
  }
  async function cancel() {
    setError("");
    try {
      const q = await api<Queue>("/api/queue");
      const pending = q.queue_pending.filter(j => jobsRef.current.includes(j[1])).map(j => j[1]);
      if (pending.length) await api("/api/queue", { delete: pending });
      const running = q.queue_running.find(j => jobsRef.current.includes(j[1]));
      if (running) await api("/api/interrupt", { prompt_id: running[1] });
      track(jobsRef.current.filter(id => !pending.includes(id)), server); setPhase("Annulation demandée"); setPreview("");
    } catch (e) { setError(String(e)); }
  }
  async function loadGallery(append = false): Promise<GalleryItem[]> {
    if (!server) return [];
    const request = ++galleryRequest.current; setGalleryBusy(true);
    try {
      if (filter === "trash") {
        const data = await api<{ items: TrashItem[] }>("/bridge/trash");
        if (request === galleryRequest.current) setTrash(data.items); return [];
      }
      const params = new URLSearchParams({ q: search, offset: String(append ? gallery.items.length : 0), limit: "40" });
      if (root) params.set("root", root);
      if (filter === "favorites") params.set("favorite", "true");
      const data = await api<Gallery>("/bridge/gallery?" + params);
      if (request === galleryRequest.current) setGallery(old => ({ ...data, items: append ? [...old.items, ...data.items] : data.items }));
      return data.items;
    } catch (e) { if (request === galleryRequest.current) setError(String(e)); throw e; }
    finally { if (request === galleryRequest.current) setGalleryBusy(false); }
  }
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => void loadGallery().catch(() => {}), 200);
    return () => { clearTimeout(t); galleryRequest.current++; };
  }, [server, search, root, filter]);
  useEffect(() => {
    // Re-entering a mounted gallery refreshes its contents without clearing the grid.
    if (tab === "gallery" && server) void loadGallery().catch(() => {});
  }, [tab]);
  const same = (a: GalleryItem | undefined, b: GalleryItem) => a?.root === b.root && a.relative === b.relative;
  async function favorite(item: ViewItem, value: boolean) {
    if (!item.gallery) return;
    const version = generation.current;
    const g = item.gallery; await api("/bridge/favorite", { root: g.root, relative: g.relative, favorite: value });
    if (version !== generation.current) return;
    setGallery(old => ({ ...old, items: old.items.map(i => same(i, g) ? { ...i, favorite: value } : i) }));
    setViewer(old => old && ({ ...old, items: old.items.map(i => same(i.gallery, g) ? { ...i, gallery: { ...g, favorite: value } } : i) }));
  }
  async function deleteImage(item: ViewItem, silent = false) {
    if (!item.gallery) return;
    const g = item.gallery;
    const version = generation.current;
    const deleted = await api<TrashItem>("/bridge/trash", { root: g.root, relative: g.relative });
    if (version !== generation.current) return;
    if (!silent) { setUndo(deleted); setNotice("Image déplacée dans la corbeille du PC."); }
    setGallery(old => ({ ...old, total: old.total - 1, items: old.items.filter(i => !same(i, g)) }));
    setViewer(old => { if (!old) return null; const items = old.items.filter(i => !same(i.gallery, g)); return items.length ? { ...old, items, index: Math.min(old.index, items.length - 1) } : null; });
  }
  async function restore(item: TrashItem) {
    try { await api("/bridge/restore", { root: item.root, id: item.id }); setUndo(null); setNotice("Image restaurée à son emplacement d’origine."); await loadGallery(); } catch (e) { setError(String(e)); }
  }
  async function reuse(item: ViewItem, url: string) {
    const parsed = resolveImport(await importImage(bytesOf(url)), { models: choices(info, "CheckpointLoaderSimple", "ckpt_name"), loras: choices(info, "LoraLoader", "lora_name"), vaes: choices(info, "VAELoader", "vae_name"), samplers: choices(info, "KSampler", "sampler_name"), schedulers: choices(info, "KSampler", "scheduler") });
    setSettings(normalizeSettings(parsed.settings)); setImported(parsed); setMode("simple"); setCustom(parsed.workflow ?? null); setCustomText(parsed.workflow ? JSON.stringify(parsed.workflow, null, 2) : "");
    setResults([{ ...item, url }]); setPreview(""); setViewer(null); setTab("create"); setPhase("Paramètres chargés depuis l’image"); setError(""); setNotice("Les paramètres et la seed reconnus sont prêts à être réutilisés."); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function importFile(file: File | undefined, type: "image" | "workflow") {
    if (!file) return;
    setError("");
    try {
      if (file.size > (type === "image" ? 64 : 10) * 1024 * 1024) throw new Error("Fichier trop volumineux.");
      if (type === "image") {
        const url = await dataUrl(file); await reuse({ path: "local:" + file.name + ":" + file.lastModified, name: file.name, url }, url);
      } else { const w = parseWorkflow(await file.text()); setCustom(w); setCustomText(JSON.stringify(w, null, 2)); setMode("workflow"); }
    } catch (e) { setError(String(e)); }
  }
  const device = stats?.devices?.[0]; const deviceName = (device?.name ?? "GPU du PC").replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync.*$/, "").replace(/^NVIDIA GeForce\s+/, "");
  const views = (items: GalleryItem[]): ViewItem[] => items.map(g => ({ path: galleryPath(g), name: g.name, gallery: g }));
  const closeViewer = () => { const from = viewer?.fromGallery; setViewer(null); if (from) void loadGallery().catch(() => {}); };
  const renderPage = (tab: Page, active: boolean) => <>
<div className="page-heading"><h1>{tab === "create" ? "Atelier" : tab === "gallery" ? "Galerie" : tab === "glossary" ? "Glossaire" : "Paramètres"}</h1>{tab === "gallery" && <button aria-label="Actualiser la galerie" disabled={galleryBusy || !server} onClick={() => void loadGallery().catch(() => {})}><RefreshCw size={20} className={galleryBusy ? "spin" : ""} /></button>}</div>
    {tab === "glossary" && <Glossary onNotice={text => { setUndo(null); setNotice(text); }} onAdd={(tags, side) => setSettings(s => { const existing = new Set(s[side].split(",").map(t => t.trim())); const added = tags.map(t => t.replace(/[()]/g, "\\$&")).filter(t => !existing.has(t)); return { ...s, [side]: [s[side].trim().replace(/,\s*$/, ""), ...added].filter(Boolean).join(", ") }; })} />}
    {tab === "connect" && <Connections active={active} server={server} busy={busy} onConnect={connect} onDisconnect={disconnect} onError={setError} />}
    {(tab === "create" || tab === "gallery") && !server && <section className="panel empty-state"><span className="empty-orbit"><Monitor size={36} /></span><h2>Votre atelier vous attend</h2><p className="muted">Connectez un PC pour retrouver ses modèles et ses images.</p><button className="primary" onClick={() => setTab("connect")}>Choisir une connexion <ArrowUpRight size={18} /></button></section>}
    {tab === "create" && server && <>
      <CollapsibleCard className="output-panel" title={jobs.length ? "Votre image prend vie" : results.length ? "La dernière création" : "Rendu de génération"} eyebrow="LE RENDU" reveal={jobs.length > 0 || results.length > 0}><div className={results.length || preview ? "output-image" : "output-empty"}>{preview ? <img src={preview} alt="Aperçu de génération en cours" /> : results[0] ? <Picture path={results[0].path} source={results[0].url} alt={results[0].name} onOpen={url => setViewer({ items: results.map((r, i) => i === 0 ? { ...r, url } : r), index: 0, fromGallery: false })} key={results[0].path} /> : <><span className="empty-orbit"><Sparkles size={34} /></span><h3>Imaginez la suite.</h3><p>Votre prochaine image apparaîtra ici,<br />avec son aperçu pendant la génération.</p></>}</div>
      <div className="output-footer"><span role="status">{phase}{!jobs.length && results.length > 0 ? ` · ${results.length} image${results.length > 1 ? "s" : ""}` : ""}</span>{jobs.length > 0 && <button className="text-button" onClick={() => void cancel()}>Annuler mes lots</button>}</div>{jobs.length > 0 && <progress max={100} value={progress} aria-label="Progression de génération" />}{results.length > 1 && <div className="result-strip">{results.map((r, i) => <Picture small key={r.path} path={r.path} alt={r.name} onOpen={url => setViewer({ items: results.map((v, n) => n === i ? { ...v, url } : v), index: i, fromGallery: false })} />)}</div>}</CollapsibleCard>
      <div className="studio-toolbar"><Presets settings={settings} mode={mode} workflow={custom} onApply={p => { setSettings(p.settings); setMode(p.mode); setCustom(p.workflow); setCustomText(p.workflow ? JSON.stringify(p.workflow, null, 2) : ""); setImported(null); setNotice(`Preset « ${p.name} » chargé.`); setError(""); }} /><label className="file-picker"><Upload size={18} /> Paramètres depuis une image<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={e => { void importFile(e.target.files?.[0], "image"); e.target.value = ""; }} /></label><div className="segmented"><button aria-pressed={mode === "simple"} onClick={() => setMode("simple")}>Automatique</button><button aria-pressed={mode === "workflow"} onClick={() => setMode("workflow")}>Workflow API</button></div></div>
      {imported && <CollapsibleCard className="import-summary" title="Paramètres importés"><div className="section-heading"><strong>Import · {imported.source}</strong><button aria-label="Fermer le détail de l’import" onClick={() => setImported(null)}><X size={16} /></button></div><p>{settings.width} × {settings.height} · {settings.steps} steps · Seed {settings.seed || "absente"}</p>{imported.warnings.length > 0 && <ul>{imported.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}{custom && <button className="text-button" onClick={() => setMode("workflow")}>Ouvrir le workflow API original <ArrowUpRight size={15} /></button>}</CollapsibleCard>}
      {mode === "simple" ? <div className="settings-grid"><SettingsPanel settings={settings} onChange={setSettings} info={info} lastSeed={lastSeed} /></div> : <CollapsibleCard title="Workflow API"><p className="muted">Conservez les nœuds, modèles et réglages d’un workflow ComfyUI complet. Les champs du mode automatique ne modifient pas ce graphe.</p><label className="file-picker"><FolderOpen size={19} /> Importer un workflow API<input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0], "workflow"); e.target.value = ""; }} /></label><label>Workflow JSON<textarea className="code-editor" rows={14} spellCheck={false} value={customText} onChange={e => { setCustomText(e.target.value); setCustom(null); }} /></label><button onClick={() => { try { const w = parseWorkflow(customText); checkWorkflow(w, info); setCustom(w); setNotice("Workflow validé sur ce PC."); setError(""); } catch (e) { setError(String(e)); } }}>Valider les modifications</button></CollapsibleCard>}
      <div className="generate-bar"><div><strong>{mode === "simple" ? `${settings.batch * settings.batches || 0} image(s)` : "Workflow personnalisé"}</strong><small>{deviceName} · {queue.queue_pending.length} en attente</small></div><button className="primary" disabled={busy || !online || jobs.length > 0} onClick={() => void generate()}>{busy || jobs.length ? <LoaderCircle className="spin" size={19} /> : <Sparkles size={19} />}<span>{jobs.length ? "Génération en cours" : "Générer l’image"}</span></button></div>
    </>}
    {tab === "gallery" && server && <><div className="gallery-toolbar"><label className="search-box"><Search size={19} /><input aria-label="Rechercher dans la galerie" placeholder="Rechercher une image…" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="root-select"><span className="sr-only">Dossier</span><select value={root} onChange={e => setRoot(e.target.value)}><option value="">Tous les dossiers</option>{roots.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div><div className="collection-tabs"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}><Images size={17} /> Toutes</button><button aria-pressed={filter === "favorites"} onClick={() => setFilter("favorites")}><Heart size={17} /> Favoris</button><button aria-pressed={filter === "trash"} onClick={() => setFilter("trash")}><Trash2 size={17} /> Corbeille</button></div>
      {filter === "trash" ? <section className="panel"><h2>Corbeille récupérable</h2><p className="muted">Les images restent sur le PC jusqu’à leur restauration. Aucune suppression définitive automatique.</p>{trash.map(t => <div className="trash-row" key={t.id}><Trash2 size={20} /><span><strong>{t.name}</strong><small>{new Date(t.deleted).toLocaleString("fr-FR")}</small></span><button onClick={() => void restore(t)}><RotateCcw size={17} /> Restaurer</button></div>)}{!trash.length && <p>La corbeille est vide.</p>}</section> : <><div className="section-heading"><h2>{filter === "favorites" ? "À garder tout près" : "Votre collection"}</h2><div className="gallery-density"><span className="muted">{gallery.total} images</span><label><span className="sr-only">Nombre de colonnes</span><select aria-label="Nombre de colonnes" value={columns} onChange={e => { const n = Number(e.target.value); setColumns(n); localStorage.setItem("gallery-columns", JSON.stringify(n)); }}>{[2, 3, 4].map(n => <option key={n} value={n}>{n} colonnes</option>)}</select></label></div></div>{gallery.warnings.map((w, i) => <p className="hint" key={i}>{w}</p>)}<GalleryGrid active={active} items={gallery.items} columns={columns} scope={`${server}|${root}|${filter}|${search}`} onFavorite={favorite} onTrash={deleteImage} onNotice={text => { setUndo(null); setNotice(text); }} onOpen={(i, url) => setViewer({ items: views(gallery.items).map((v, n) => n === i ? { ...v, url } : v), index: i, fromGallery: true })} />{!gallery.items.length && !galleryBusy && <div className="panel empty-state"><Heart size={32} /><h3>{filter === "favorites" ? "Vos coups de cœur auront leur place ici." : "Aucune image pour le moment."}</h3><p className="muted">Vos générations sur le PC apparaîtront dans cette collection.</p></div>}{gallery.items.length < gallery.total && <button className="load-more" disabled={galleryBusy} onClick={() => void loadGallery(true).catch(() => {})}>Afficher la suite</button>}</>}
    </>}

  </>;
  return <div className="app"><a className="skip" href="#main">Aller au contenu</a><aside className="sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setTab(server ? "create" : "connect"); }}><span className="brand-icon"><Sparkles size={25} /></span><span>comfy <b>pocket</b><small>VOTRE STUDIO, PARTOUT</small></span></a><nav aria-label="Navigation principale">{([{ id: "create", label: "Créer", icon: Sparkles }, { id: "gallery", label: "Galerie", icon: Images }, { id: "glossary", label: "Glossaire", icon: BookOpen }, { id: "connect", label: "Paramètres", icon: SettingsIcon }] as const).map(t => <button key={t.id} className={tab === t.id ? "nav active" : "nav"} onClick={() => setTab(t.id)} aria-label={t.label} title={t.label} aria-current={tab === t.id ? "page" : undefined}><t.icon size={22} strokeWidth={1.7} /></button>)}</nav><div className="sidebar-foot"><Monitor size={22} /><p>Votre PC crée.<br />Vos idées voyagent.</p></div></aside><div className="workspace"><header className="topbar"><span className="eyebrow">{tab === "create" ? "L’ATELIER" : tab === "gallery" ? "VOTRE COLLECTION" : tab === "glossary" ? "LES MOTS DE VOS IMAGES" : "VOTRE ESPACE PRIVÉ"}</span><button className={online ? "status connected" : "status"} onClick={() => setShowConnection(true)} aria-haspopup="dialog"><span className="dot" />{online ? "PC connecté" : server ? "PC indisponible" : "Non connecté"}<ChevronDown size={14} /></button></header><main id="main" className="page-window" {...handlers}><div className="page-track" ref={trackRef}>{pages.map((page, i) => <div key={page} className={`page-pane ${tab === page ? "active-pane" : ""}`} data-page={page} inert={tab !== page} aria-hidden={tab !== page} style={{ left: `${(i - pages.indexOf(tab)) * 100}%` }}>{renderPage(page, page === tab)}</div>)}</div></main><footer className="app-footer">Créé sur votre PC. Emporté partout.</footer></div>
    <div className="toast-stack">{error && <Toast key={"error:" + error} message={error} error onClose={() => setError("")} />}{notice && <Toast key={"notice:" + notice} message={notice} onClose={() => { setNotice(""); setUndo(null); }}>{undo && <button onClick={() => void restore(undo)}><RotateCcw size={16} /> Annuler la suppression</button>}</Toast>}</div>
    {showConnection && <ConnectionStatus server={server} initial={stats} onClose={() => setShowConnection(false)} onSettings={() => { setShowConnection(false); setTab("connect"); }} />}
    {viewer && <Viewer items={viewer.items} index={viewer.index} onIndex={index => setViewer(v => v ? { ...v, index: Math.min(index, v.items.length - 1) } : v)} onClose={closeViewer} onFavorite={favorite} onTrash={deleteImage} onReuse={reuse} onMore={viewer.fromGallery && gallery.items.length < gallery.total ? async () => { const next = await loadGallery(true); const all = [...viewer.items, ...views(next)]; setViewer(v => v && ({ ...v, items: all })); return all; } : undefined} />}
  </div>;
}
