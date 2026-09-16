import { useState } from "react";
import { History, Layers, ScanText, Trash2, Pencil } from "lucide-react";
import { Modal } from "./components";
import { appendBlock, checkPrompts, readPromptLibrary, writePromptLibrary, type LibraryKind, type PromptEntry, type Prompts } from "./promptLibrary";
export default function PromptTools({ values, onChange }: { values: Prompts; onChange: (value: Prompts) => void }) {
  const [page, setPage] = useState<LibraryKind | "check" | null>(null), [items, setItems] = useState<PromptEntry[]>([]), [search, setSearch] = useState(""), [error, setError] = useState(""), [draft, setDraft] = useState<PromptEntry | null>(null);
  const issues = checkPrompts(values);
  function show(kind: LibraryKind | "check") { setError(""); setSearch(""); setItems([]); setPage(kind); if (kind !== "check") try { setItems(readPromptLibrary(kind)); } catch (e) { setError(String(e)); } }
  function save(next: PromptEntry[]) { if (!page || page === "check") return; writePromptLibrary(page, next); setItems(next); }
  function run(fn: () => void) { setError(""); try { fn(); } catch (e) { setError(String(e)); } }
  return <><div className="prompt-tools"><button onClick={() => show("history")}><History size={16} /> Historique</button><button onClick={() => show("blocks")}><Layers size={16} /> Blocs</button><button onClick={() => show("check")}><ScanText size={16} /> Vérifier{issues.length > 0 ? ` (${issues.length})` : ""}</button></div>
    {page && <Modal title={page === "check" ? "Vérifier les prompts" : page === "history" ? "Historique de prompts" : "Blocs réutilisables"} className="prompt-library" onClose={() => { setPage(null); setDraft(null); }}>
      {page === "check" ? <><p className="hint">Analyse locale des tags séparés par des virgules. Les contradictions de sens restent des pistes à vérifier, selon la scène.</p>{issues.length ? <ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p>Aucun conflit repéré par les règles disponibles.</p>}</> : <>
        <label>Rechercher<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        {page === "blocks" && <button className="primary" onClick={() => setDraft({ id: crypto.randomUUID(), title: "", at: Date.now(), ...values })}>Nouveau bloc</button>}
        <p className="hint">{page === "history" ? "100 dernières versions enregistrées à la fermeture de l’éditeur ou au lancement d’une génération. Stockage sur cet appareil." : "Un bloc ajoute son texte aux prompts existants. Stockage sur cet appareil."}</p>
        {items.filter(i => `${i.title} ${i.positive} ${i.negative}`.toLowerCase().includes(search.toLowerCase())).map(i => <article className="prompt-record" key={i.id}><strong>{i.title}</strong>{page === "history" && <small>{new Date(i.at).toLocaleString("fr-FR")}</small>}<p><b>Positif</b> {i.positive || "—"}</p><p><b>Négatif</b> {i.negative || "—"}</p><div className="row"><button onClick={() => { onChange(page === "blocks" ? { positive: appendBlock(values.positive, i.positive), negative: appendBlock(values.negative, i.negative) } : { positive: i.positive, negative: i.negative }); setPage(null); }}>{page === "blocks" ? "Insérer" : "Restaurer"}</button>{page === "blocks" && <button aria-label={`Modifier ${i.title}`} onClick={() => setDraft({ ...i })}><Pencil size={16} /></button>}<button aria-label={`Supprimer ${i.title}`} onClick={() => run(() => save(items.filter(p => p.id !== i.id)))}><Trash2 size={16} /></button></div></article>)}
        {!items.length && <p>{page === "history" ? "Aucun prompt enregistré pour le moment." : "Créez votre premier bloc : éclairage, style, composition…"}</p>}
      </>}{error && <p role="alert">{error}</p>}
    </Modal>}
    {draft && page === "blocks" && <Modal title="Éditer le bloc" className="prompt-library" onClose={() => setDraft(null)}><form onSubmit={e => { e.preventDefault(); run(() => { save([{ ...draft, title: draft.title.trim() }, ...items.filter(i => i.id !== draft.id)]); setDraft(null); }); }}><label>Titre<input autoFocus maxLength={80} required value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>{(["positive", "negative"] as const).map(side => <label key={side}>{side === "positive" ? "Positif" : "Négatif"}<textarea maxLength={20000} value={draft[side]} onChange={e => setDraft({ ...draft, [side]: e.target.value })} /></label>)}{error && <p role="alert">{error}</p>}<button className="primary" disabled={!draft.title.trim() || !draft.positive.trim() && !draft.negative.trim()}>Enregistrer</button></form></Modal>}
  </>;
}
