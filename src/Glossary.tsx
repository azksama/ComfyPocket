import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Plus,
  Minus,
  Check,
  X,
  ChevronRight,
  UserRound,
  Sparkles,
  Shirt,
  Mountain,
} from "lucide-react";
import { translations, normalizeSearch } from "./taxonomy";
import catalog from "./data/glossary.json";

const display = (s: string) => s.replace(/_/g, " ");
const appearance = new Set(
  "Ass|Body parts|Breasts tags|Ears tags|Eyes tags|Face tags|Focus tags|Gestures|Hair|Hair color|Hair styles|Nudity|Posture|Pussy|Shoulders|Skin color|Tail|Wings|Tag group:People|Tag group:Groups|Tag group:Family relationships|Tag group:Jobs".split(
    "|",
  ),
);
const clothing = new Set(
  "Attire|Bra|Dress|Eyewear|Fashion style|Handwear|Headwear|Legwear|List of armor|List of uniforms|Mask|Neck and neckwear|Panties|Piercings|Sexual attire|Sleeves".split(
    "|",
  ),
);
const style = new Set(
  "Artistic license|Audio tags|Censorship|Colors|Image composition|Lighting|List of style parodies|Patterns|Prints|Symbols|Text|Year tags|tag group:Drawing Software|tag group:metatags".split(
    "|",
  ),
);
const familyOf = (id: string) =>
  appearance.has(id)
    ? "person"
    : clothing.has(id)
      ? "clothes"
      : style.has(id)
        ? "style"
        : "scenes";
const families = [
  {
    id: "person",
    name: "Personnage",
    detail: "Visage, cheveux, expressions",
    Icon: UserRound,
  },
  {
    id: "style",
    name: "Style & rendu",
    detail: "Lumière, couleurs, composition",
    Icon: Sparkles,
  },
  {
    id: "clothes",
    name: "Tenues",
    detail: "Vêtements et accessoires",
    Icon: Shirt,
  },
  {
    id: "scenes",
    name: "Décors",
    detail: "Lieux, objets et activités",
    Icon: Mountain,
  },
];
function Glossary({
  onAdd,
  onNotice,
}: {
  onAdd: (tags: string[], side: "positive" | "negative") => void;
  onNotice: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("person");
  const [theme, setTheme] = useState("Hair color");
  const [section, setSection] = useState(0);
  const [limit, setLimit] = useState(80);
  const [selected, setSelected] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = categoryRef.current;
    const choice = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (list && choice)
      list.scrollLeft +=
        choice.getBoundingClientRect().left -
        list.getBoundingClientRect().left -
        (list.clientWidth - choice.clientWidth) / 2;
  }, [family, theme, query]);
  const themes = catalog.themes.filter((t) => familyOf(t.id) === family);
  const current = themes.find((t) => t.id === theme) ?? themes[0];
  const flat = useMemo(() => {
    const q = normalizeSearch(query),
      seen = new Set<string>();
    const scope = q ? catalog.themes : current ? [current] : [];
    return scope
      .flatMap((t) =>
        t.sections.flatMap((s, index) =>
          !q && index !== section
            ? []
            : s.tags
                .filter(
                  (tag) =>
                    !q ||
                    normalizeSearch(
                      `${t.name} ${s.name} ${tag} ${translations[tag] ?? ""}`,
                    ).includes(q),
                )
                .map((tag) => ({
                  tag,
                  context: `${display(t.name)}${s.name ? " · " + display(s.name) : ""}`,
                })),
        ),
      )
      .filter(({ tag }) => {
        if (seen.has(tag)) return false;
        seen.add(tag);
        return true;
      });
  }, [query, current, section]);
  const select = (tag: string) =>
    setSelected((old) =>
      old.includes(tag) ? old.filter((t) => t !== tag) : [...old, tag],
    );
  const add = (side: "positive" | "negative") => {
    onAdd(selected, side);
    onNotice(
      `${selected.length} tag(s) ajouté(s) au prompt ${side === "positive" ? "positif" : "négatif"}.`,
    );
    setSelected([]);
  };
  return (
    <div className="glossary">
      <label className="search-box glossary-search">
        <Search size={18} />
        <input
          ref={searchRef}
          aria-label="Rechercher dans le glossaire"
          placeholder="Chercher un tag, une idée…"
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
      {!query && (
        <>
          <div className="theme-grid">
            {families.map(({ id, name, detail, Icon }) => (
              <button
                key={id}
                className="theme-card"
                aria-pressed={family === id}
                onClick={() => {
                  setFamily(id);
                  setTheme("");
                  setSection(0);
                  setLimit(80);
                }}
              >
                <span className="theme-icon">
                  <Icon />
                </span>
                <strong>{name}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          {family && current ? (
            <>
              <div className="glossary-breadcrumb">
                <button
                  onClick={() => {
                    setFamily("");
                    setTheme("");
                  }}
                >
                  Toutes les catégories
                </button>
                <ChevronRight size={13} />
                <span>{families.find((f) => f.id === family)?.name}</span>
              </div>
              <div className="section-heading">
                <h2>Tout est dans le détail</h2>
                <span className="muted">{themes.length} catégories</span>
              </div>
              <div
                ref={categoryRef}
                className="theme-choices"
                aria-label="Catégories"
              >
                {themes.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={current.id === t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setSection(0);
                      setLimit(80);
                    }}
                  >
                    {display(t.name)}
                  </button>
                ))}
              </div>
              {current.sections.length > 1 && (
                <div className="section-choices" aria-label="Rubriques">
                  {current.sections.map((s, i) => (
                    <button
                      key={i}
                      aria-pressed={section === i}
                      onClick={() => {
                        setSection(i);
                        setLimit(80);
                      }}
                    >
                      {display(s.name || "Tags")}
                    </button>
                  ))}
                </div>
              )}
              <div className="glossary-description">
                <h3>
                  {display(current.sections[section]?.name || current.name)}
                </h3>
                <p>
                  {display(current.name)} · {flat.length} tags
                </p>
              </div>
            </>
          ) : (
            <p className="hint">
              {catalog.themes.length} catégories · Disponible hors ligne. Les
              tags de personnages nommés et de séries sont exclus.
            </p>
          )}
        </>
      )}
      {query && (
        <div className="section-heading">
          <h2>Résultats de recherche</h2>
          <span className="muted">{flat.length} tags</span>
        </div>
      )}
      {(query || family) && (
        <>
          <div className="glossary-tags">
            {flat.slice(0, limit).map(({ tag, context }, i) => (
              <button
                key={tag}
                className={`glossary-tag ${selected.includes(tag) ? "selected" : ""}`}
                aria-pressed={selected.includes(tag)}
                onClick={() => select(tag)}
              >
                <span
                  className="tag-dot"
                  aria-hidden="true"
                  style={{
                    background: ["#d5c0e9", "#e7cae0", "#c8d8e8", "#ded2bd"][
                      i % 4
                    ],
                  }}
                />
                <span>
                  <strong>{tag}</strong>
                  <small>{translations[tag] ?? display(tag)}</small>
                  {query && <small>{context}</small>}
                </span>
                {selected.includes(tag) ? (
                  <Check size={18} />
                ) : (
                  <Plus size={18} />
                )}
              </button>
            ))}
          </div>
          {flat.length > limit && (
            <button
              className="load-more"
              onClick={() => setLimit((n) => n + 80)}
            >
              Afficher la suite
            </button>
          )}
          {!flat.length && (
            <div className="empty-state">
              <Search size={30} />
              <h3>Aucun tag trouvé</h3>
              <p>Essayez un mot plus court ou une autre catégorie.</p>
            </div>
          )}
        </>
      )}
      {selected.length > 0 && (
        <div className="glossary-selection">
          <strong>Votre sélection · {selected.length} tag(s)</strong>
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
