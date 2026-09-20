import { useMemo, useState, useEffect } from "react";
import {
  History,
  Layers,
  ScanText,
  Trash2,
  Pencil,
  Search,
  Plus,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Modal } from "./components";
import {
  appendBlock,
  checkPrompts,
  readPromptLibrary,
  writePromptLibrary,
  promptStorageError,
  PROMPT_LIBRARY_LIMIT,
  type LibraryKind,
  type PromptEntry,
  type Prompts,
} from "./promptLibrary";
import "./prompt-experience.css";

type Page = LibraryKind | "check";
type DeletedEntry = { item: PromptEntry; index: number };
const searchable = (text: string) =>
  text
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ");
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function PromptRecord({
  entry,
  kind,
  onApply,
  onEdit,
  onDelete,
}: {
  entry: PromptEntry;
  kind: LibraryKind;
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="prompt-record">
      <header>
        <h3>{entry.title || "Prompt sans titre"}</h3>
        {kind === "history" && (
          <time dateTime={new Date(entry.at).toISOString()}>
            {dateFormat.format(entry.at)}
          </time>
        )}
      </header>
      <details className="prompt-record-text">
        <summary>Voir les prompts</summary>
        <p>
          <b>Positif</b>
          {entry.positive || "Aucun texte"}
        </p>
        <p>
          <b>Négatif</b>
          {entry.negative || "Aucun texte"}
        </p>
      </details>
      <div className="prompt-record-actions">
        <button className="prompt-record-apply" onClick={onApply}>
          {kind === "blocks" ? "Insérer" : "Restaurer"}
        </button>
        <div>
          {kind === "blocks" && (
            <button aria-label={`Modifier ${entry.title}`} onClick={onEdit}>
              <Pencil size={17} />
            </button>
          )}
          <button aria-label={`Supprimer ${entry.title}`} onClick={onDelete}>
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function PromptTools({
  initialPage,
  values,
  onChange,
}: {
  initialPage?: Page;
  values: Prompts;
  onChange: (value: Prompts) => void;
}) {
  const [page, setPage] = useState<Page | null>(null);
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<PromptEntry | null>(null);
  const [draftError, setDraftError] = useState("");
  const [deleted, setDeleted] = useState<DeletedEntry | null>(null);
  const issues = useMemo(
    () => checkPrompts(values),
    [values.positive, values.negative],
  );
  const filtered = useMemo(() => {
    const query = searchable(search.trim());
    return items.filter((entry) =>
      searchable(`${entry.title} ${entry.positive} ${entry.negative}`).includes(
        query,
      ),
    );
  }, [items, search]);

  function show(kind: Page) {
    setError("");
    setSearch("");
    setItems([]);
    setDeleted(null);
    setReady(false);
    setPage(kind);
    if (kind === "check") return;
    try {
      setItems(readPromptLibrary(kind));
      setReady(true);
    } catch (reason) {
      setError(promptStorageError(reason));
    }
  }
  useEffect(() => {
    if (initialPage) show(initialPage);
  }, [initialPage]);
  function close() {
    setPage(null);
    setDraft(null);
    setDeleted(null);
  }
  function save(next: PromptEntry[]) {
    if (!page || page === "check") return;
    writePromptLibrary(page, next);
    setItems(next);
  }
  function run(action: () => void) {
    setError("");
    try {
      action();
    } catch (reason) {
      setError(promptStorageError(reason));
    }
  }
  function beginDraft(entry?: PromptEntry) {
    setDraftError("");
    setDraft(
      entry
        ? { ...entry }
        : { id: crypto.randomUUID(), title: "", at: Date.now(), ...values },
    );
  }
  function remove(entry: PromptEntry) {
    run(() => {
      const index = items.findIndex((item) => item.id === entry.id);
      save(items.filter((item) => item.id !== entry.id));
      setDeleted({ item: entry, index });
    });
  }
  function undoDelete() {
    if (!deleted) return;
    run(() => {
      const next = [...items];
      next.splice(Math.min(deleted.index, next.length), 0, deleted.item);
      save(next);
      setDeleted(null);
    });
  }
  function saveDraft() {
    if (!draft) return;
    setDraftError("");
    try {
      save([
        { ...draft, title: draft.title.trim(), at: Date.now() },
        ...items.filter((item) => item.id !== draft.id),
      ]);
      setDraft(null);
    } catch (reason) {
      setDraftError(promptStorageError(reason));
    }
  }

  return (
    <>
      <div className="prompt-tools">
        <button onClick={() => show("history")}>
          <History size={16} /> Historique
        </button>
        <button onClick={() => show("blocks")}>
          <Layers size={16} /> Blocs
        </button>
        <button onClick={() => show("check")}>
          <ScanText size={16} /> Vérifier
          {issues.length > 0 && (
            <span className="prompt-issue-count">({issues.length})</span>
          )}
        </button>
      </div>
      {page && (
        <Modal
          title={
            page === "check"
              ? "Vérifier les prompts"
              : page === "history"
                ? "Historique de prompts"
                : "Blocs réutilisables"
          }
          className="prompt-library"
          onClose={close}
        >
          {page === "check" ? (
            <>
              <p className="hint prompt-check-description">
                Analyse locale des tags séparés par des virgules. Les
                contradictions de sens restent des pistes à vérifier, selon la
                scène.
              </p>
              {issues.length ? (
                <ul className="prompt-issues">
                  {issues.map((issue) => (
                    <li key={issue}>
                      <AlertCircle size={19} aria-hidden="true" />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="prompt-library-empty">
                  <CheckCircle2 size={32} />
                  <p>Aucun conflit repéré par les règles disponibles.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="prompt-library-toolbar">
                <label className="search-box">
                  <Search size={19} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Rechercher dans les prompts"
                    placeholder={
                      page === "history"
                        ? "Rechercher un prompt…"
                        : "Rechercher un bloc…"
                    }
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                {page === "blocks" && (
                  <button
                    className="primary"
                    disabled={!ready || items.length >= PROMPT_LIBRARY_LIMIT}
                    onClick={() => beginDraft()}
                  >
                    <Plus size={18} /> Nouveau bloc
                  </button>
                )}
              </div>
              <div className="prompt-library-meta">
                <span>
                  {search
                    ? `${filtered.length} résultat${filtered.length === 1 ? "" : "s"}`
                    : `${items.length} / ${PROMPT_LIBRARY_LIMIT}`}
                </span>
                <span>Sur cet appareil</span>
              </div>
              <p className="hint prompt-library-description">
                {page === "history"
                  ? "Versions enregistrées à la fermeture de l’éditeur ou au lancement d’une génération. Les plus anciennes sont effacées si l’espace manque."
                  : "Insérer un bloc ajoute ses textes aux prompts actuels."}
              </p>
              {ready && (
                <div className="prompt-records">
                  {filtered.map((entry) => (
                    <PromptRecord
                      key={entry.id}
                      entry={entry}
                      kind={page}
                      onApply={() => {
                        onChange(
                          page === "blocks"
                            ? {
                                positive: appendBlock(
                                  values.positive,
                                  entry.positive,
                                ),
                                negative: appendBlock(
                                  values.negative,
                                  entry.negative,
                                ),
                              }
                            : {
                                positive: entry.positive,
                                negative: entry.negative,
                              },
                        );
                        close();
                      }}
                      onEdit={() => beginDraft(entry)}
                      onDelete={() => remove(entry)}
                    />
                  ))}
                </div>
              )}
              {ready && !filtered.length && (
                <div className="prompt-library-empty">
                  {page === "history" ? (
                    <History size={32} />
                  ) : (
                    <Layers size={32} />
                  )}
                  <p>
                    {search
                      ? "Aucun prompt ne correspond à votre recherche."
                      : page === "history"
                        ? "Aucun prompt enregistré pour le moment."
                        : "Créez votre premier bloc : éclairage, style, composition…"}
                  </p>
                  {search && (
                    <button onClick={() => setSearch("")}>
                      Effacer la recherche
                    </button>
                  )}
                </div>
              )}
              {page === "blocks" && items.length >= PROMPT_LIBRARY_LIMIT && (
                <p className="hint">
                  Limite de 100 blocs atteinte. Supprimez un bloc pour en créer
                  un nouveau.
                </p>
              )}
              {deleted && (
                <div className="prompt-library-undo" role="status">
                  <span>Prompt supprimé</span>
                  <button onClick={undoDelete}>
                    <RotateCcw size={16} /> Annuler
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <div className="prompt-library-error" role="alert">
              <p>{error}</p>
              {!ready && page !== "check" && (
                <button onClick={() => show(page)}>Réessayer</button>
              )}
            </div>
          )}
        </Modal>
      )}
      {draft && page === "blocks" && (
        <Modal
          title="Éditer le bloc"
          className="prompt-library prompt-block-editor"
          onClose={() => setDraft(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveDraft();
            }}
          >
            <label>
              Titre
              <input
                autoFocus
                maxLength={80}
                required
                placeholder="Lumière douce, photo argentique…"
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            {(["positive", "negative"] as const).map((side) => (
              <label key={side}>
                {side === "positive" ? "Positif" : "Négatif"}
                <textarea
                  maxLength={20000}
                  value={draft[side]}
                  onChange={(event) =>
                    setDraft({ ...draft, [side]: event.target.value })
                  }
                />
              </label>
            ))}
            {draftError && <p role="alert">{draftError}</p>}
            <div className="prompt-block-footer">
              <button type="button" onClick={() => setDraft(null)}>
                Annuler
              </button>
              <button
                className="primary"
                disabled={
                  !draft.title.trim() ||
                  (!draft.positive.trim() && !draft.negative.trim())
                }
              >
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
