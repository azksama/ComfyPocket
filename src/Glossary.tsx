import { memo, useMemo, useRef, useState } from "react";
import {
  Search,
  ArrowLeft,
  Plus,
  Minus,
  BookOpen,
  Check,
  X,
  ChevronDown,
} from "lucide-react";
import { translations, normalizeSearch } from "./taxonomy";
import catalog from "./data/glossary.json";
const counts = new Map(
  catalog.themes.map((t) => [
    t.id,
    new Set(t.sections.flatMap((s) => s.tags)).size,
  ]),
);
const display = (s: string) => s.replace(/_/g, " ");
function Glossary({
  onAdd,
  onNotice,
}: {
  onAdd: (tags: string[], side: "positive" | "negative") => void;
  onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [theme, setTheme] = useState(""),
    [limit, setLimit] = useState(80),
    [selected, setSelected] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    return catalog.themes
      .filter((t) => !theme || t.id === theme)
      .map((t) => ({
        ...t,
        sections: t.sections
          .map((s) => ({
            ...s,
            tags: s.tags.filter(
              (tag) =>
                !q ||
                normalizeSearch(
                  t.name +
                    " " +
                    s.name +
                    " " +
                    tag +
                    " " +
                    (translations[tag] ?? ""),
                ).includes(q),
            ),
          }))
          .filter((s) => s.tags.length),
      }))
      .filter((t) => t.sections.length);
  }, [query, theme]);
  const total = new Set(
    filtered.flatMap((t) => t.sections.flatMap((s) => s.tags)),
  ).size;
  const flat = useMemo(() => {
    const seen = new Set<string>();
    return filtered
      .flatMap((t) =>
        t.sections.flatMap((s) =>
          s.tags.map((tag) => ({ tag, theme: t.name, section: s.name })),
        ),
      )
      .filter((v) => {
        if (seen.has(v.tag)) return false;
        seen.add(v.tag);
        return true;
      });
  }, [filtered]);
  const select = (tag: string) => {
    setSelected((old) =>
      old.includes(tag) ? old.filter((t) => t !== tag) : [...old, tag],
    );
  };
  const add = (side: "positive" | "negative") => {
    onAdd(selected, side);
    onNotice(
      `${selected.length} tag(s) ajouté(s) au prompt ${side === "positive" ? "positif" : "négatif"}.`,
    );
    setSelected([]);
  };
  const tagButton = (tag: string, subtitle?: string) => (
    <button
      key={tag}
      className={`glossary-tag ${selected.includes(tag) ? "selected" : ""}`}
      aria-pressed={selected.includes(tag)}
      onClick={() => select(tag)}
    >
      <span>
        <strong>{translations[tag] ?? display(tag)}</strong>
        <code>{tag}</code>
        {subtitle && <small>{display(subtitle)}</small>}
      </span>
      {selected.includes(tag) ? <Check size={18} /> : <Plus size={18} />}
    </button>
  );
  return (
    <div className="glossary">
      <label className="search-box glossary-search">
        <Search size={20} />
        <input
          ref={searchRef}
          aria-label="Rechercher dans le glossaire"
          placeholder="Un tag, une catégorie, une idée…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(80);
          }}
        />
        {query && (
          <button
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
      </label>
      {!theme && !query ? (
        <>
          <div className="section-heading">
            <h2>Explorer par catégorie</h2>
            <span className="muted">{catalog.themes.length} catégories</span>
          </div>
          <div className="theme-grid">
            {catalog.themes.map((t, i) => (
              <button
                key={t.id}
                className={`theme-card theme-color-${i % 5}`}
                onClick={() => {
                  setTheme(t.id);
                  setLimit(80);
                }}
              >
                <span className="theme-icon">
                  <BookOpen size={24} />
                </span>
                <strong>{display(t.name)}</strong>
                <small>{t.sections.length} rubrique(s)</small>
                <span className="theme-count">{counts.get(t.id)} tags</span>
              </button>
            ))}
          </div>
          <p className="hint">
            Catégories de Making Images Great Again · personnages et séries
            exclus. Disponible hors ligne.
          </p>
        </>
      ) : (
        <>
          <div className="section-heading">
            <button
              className="text-button"
              onClick={() => {
                setTheme("");
                setQuery("");
                setLimit(80);
              }}
            >
              <ArrowLeft size={17} /> Toutes les catégories
            </button>
            <span className="muted">{total.toLocaleString("fr-FR")} tags</span>
          </div>
          <h2>{theme ? display(theme) : "Résultats de recherche"}</h2>
          {theme && (
            <p className="hint">
              Recherche dans cette catégorie.{" "}
              <button
                className="text-button"
                onClick={() => {
                  setTheme("");
                  setLimit(80);
                }}
              >
                Chercher partout
              </button>
            </p>
          )}
          {query ? (
            <>
              <div className="glossary-tags">
                {flat
                  .slice(0, limit)
                  .map((v) =>
                    tagButton(
                      v.tag,
                      v.theme + (v.section ? " · " + v.section : ""),
                    ),
                  )}
              </div>
              {flat.length > limit && (
                <button
                  className="load-more"
                  onClick={() => setLimit((n) => n + 80)}
                >
                  Afficher la suite
                </button>
              )}
            </>
          ) : (
            filtered[0]?.sections.map((section, i) => (
              <details
                className="glossary-section"
                key={i}
                open={filtered[0].sections.length === 1 ? true : undefined}
              >
                <summary>
                  <span>{display(section.name || "Tags")}</span>
                  <small>{section.tags.length}</small>
                  <ChevronDown size={18} />
                </summary>
                <div className="glossary-tags">
                  {section.tags.map((tag) => tagButton(tag))}
                </div>
              </details>
            ))
          )}
          {!flat.length && (
            <div className="panel empty-state">
              <Search size={30} />
              <h3>Aucun tag trouvé</h3>
              <p>
                Essayez un terme anglais, un mot plus court ou une autre
                catégorie.
              </p>
            </div>
          )}
        </>
      )}
      {selected.length > 0 && (
        <div className="glossary-selection">
          <div className="selected-tags">
            {selected.map((tag) => (
              <button
                key={tag}
                onClick={() => select(tag)}
                aria-label={`Retirer ${tag} de la sélection`}
              >
                {display(tag)} <X size={13} />
              </button>
            ))}
          </div>
          <div>
            <strong>{selected.length} tag(s)</strong>
            <button onClick={() => add("negative")}>
              <Minus size={16} /> Négatif
            </button>
            <button className="primary" onClick={() => add("positive")}>
              <Plus size={16} /> Positif
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(Glossary);
