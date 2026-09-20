import { t as tr } from "./i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Search, Heart, Check, FileText } from "lucide-react";
import { api } from "./api";
import { Picture } from "./Picture";
import { Modal } from "./Modal";
import { modelPath, shortName } from "./modelNames";
const LoraDetails = lazy(() => import("./LoraDetails"));
export function ModelPicker({
  title,
  kind,
  names,
  value,
  onSelect,
  onClose,
  onTriggers,
}: {
  onTriggers?: (words: string[]) => void;
  title: string;
  kind: string;
  names: string[];
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(""),
    [limit, setLimit] = useState(60),
    [onlyFavorites, setOnlyFavorites] = useState(false),
    [favorites, setFavorites] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    api<Record<string, string[]>>("/bridge/model-favorites")
      .then((data) => {
        if (live) {
          setFavorites(data[kind] ?? []);
          setReady(true);
        }
      })
      .catch(() => {
        if (live)
          setError(
            tr(
              "Favoris indisponibles. Redémarrez le compagnon PC avec cette version.",
            ),
          );
      });
    return () => {
      live = false;
    };
  }, [kind]);
  const favorite = async (name: string) => {
    if (lock.current || !ready) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const data = await api<Record<string, string[]>>(
        "/bridge/model-favorites",
        { kind, name, favorite: !favorites.includes(name) },
      );
      setFavorites(data[kind] ?? []);
    } catch {
      setError(tr("Le favori n’a pas pu être enregistré sur le PC."));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const [detail, setDetail] = useState<string | null>(null);
  const filtered = names.filter(
    (n) =>
      n.toLowerCase().includes(search.toLowerCase()) &&
      (!onlyFavorites || favorites.includes(n)),
  );
  return (
    <Modal title={title} onClose={onClose} className="model-dialog">
      <label className="search-box">
        <Search size={19} />
        <input
          autoFocus
          aria-label={tr("Rechercher un modèle")}
          placeholder={tr("Nom du modèle…")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(60);
          }}
        />
      </label>
      <div className="model-filter">
        <span className="muted">
          {filtered.length} {tr("disponibles")}
        </span>
        <button
          aria-pressed={onlyFavorites}
          disabled={!ready}
          onClick={() => {
            setOnlyFavorites((v) => !v);
            setLimit(60);
          }}
        >
          <Heart size={16} fill={onlyFavorites ? "currentColor" : "none"} />{" "}
          {tr("Favoris")}{" "}
        </button>
      </div>
      {error && (
        <p role="alert" className="hint">
          {error}
        </p>
      )}
      <div className="model-list">
        {filtered.slice(0, limit).map((name) => (
          <div
            key={name}
            className={`model-card ${name === value ? "selected" : ""}`}
          >
            <button
              className="model-choice"
              onClick={() => {
                onSelect(name);
                onClose();
              }}
            >
              <Picture path={modelPath(kind, name)} alt="" thumbnail />
              <span>
                <strong>{shortName(name)}</strong>
                <small>{name}</small>
              </span>
              {name === value && <Check size={20} />}
            </button>
            <div className="model-actions">
              <button
                className="model-star"
                aria-label={`${favorites.includes(name) ? tr("Retirer des favoris") : tr("Mettre en favori")} ${shortName(name)}`}
                aria-pressed={favorites.includes(name)}
                disabled={!ready || saving}
                onClick={() => void favorite(name)}
              >
                <Heart
                  size={20}
                  fill={favorites.includes(name) ? "currentColor" : "none"}
                />
              </button>
              {kind === "loras" && (
                <button
                  className="lora-detail-button"
                  aria-label={tr("Fiche {0}", [shortName(name)])}
                  onClick={() => setDetail(name)}
                >
                  <FileText size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {filtered.length > limit && (
        <button className="wide" onClick={() => setLimit((n) => n + 60)}>
          {" "}
          {tr("Afficher la suite")}{" "}
        </button>
      )}
      {!filtered.length && (
        <p>
          {onlyFavorites
            ? tr("Marquez vos modèles avec le cœur pour les retrouver ici.")
            : tr("Aucun modèle ne correspond à cette recherche.")}
        </p>
      )}
      {detail && (
        <Suspense
          fallback={<p role="status">{tr("Ouverture de la fiche…")}</p>}
        >
          <LoraDetails
            name={detail}
            onClose={() => setDetail(null)}
            onTriggers={onTriggers}
            onSelect={() => {
              onSelect(detail);
              onClose();
            }}
          />
        </Suspense>
      )}
    </Modal>
  );
}
