import { modelMetadata } from "./modelMetadata";
import { compatibleModel } from "./modelCompatibility";
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
  checkpoint,
}: {
  checkpoint?: string;
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
  const [base, setBase] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(kind === "loras");
  const [compatibilityError, setCompatibilityError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const namesKey = JSON.stringify(names);
  useEffect(() => {
    if (kind !== "loras") return;
    let live = true;
    setChecking(true);
    setCompatibilityError("");
    setMetadata({});
    setBase("");
    setShowAll(false);
    void (async () => {
      try {
        const info = checkpoint
          ? await api<{ baseModel: string }>(
              `/bridge/model-info?kind=checkpoints&name=${encodeURIComponent(checkpoint)}`,
            )
          : { baseModel: "" };
        if (!live) return;
        setBase(info.baseModel);
        const result = await modelMetadata("loras", names, () => live);
        if (live) setMetadata(result);
      } catch {
        if (live)
          setCompatibilityError(
            tr("Compatibilité indisponible. Mettez à jour le compagnon PC."),
          );
      } finally {
        if (live) setChecking(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [kind, checkpoint, namesKey]);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    setReady(false);
    setFavorites([]);
    setError("");
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
      (kind !== "loras" ||
        showAll ||
        (!!base && compatibleModel(base, metadata[n] || ""))) &&
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
      {kind === "loras" && (
        <section className="compatibility-filter">
          <strong>
            {checking
              ? tr("Vérification des modèles de base…")
              : base
                ? tr("LoRA compatibles avec {0}", [base])
                : tr("Modèle de base non renseigné")}
          </strong>
          <p className="hint">
            {compatibilityError ||
              (base
                ? tr(
                    "Seuls les LoRA de la même famille déclarée sont affichés. Les modèles sans métadonnées sont masqués.",
                  )
                : tr(
                    "La compatibilité ne peut pas être déterminée sans métadonnées du checkpoint.",
                  ))}
          </p>
          <button
            aria-pressed={showAll}
            onClick={() => {
              setShowAll((v) => !v);
              setLimit(60);
            }}
          >
            {showAll
              ? tr("Afficher les compatibles")
              : tr("Voir tous les LoRA")}
          </button>
        </section>
      )}
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
                <small>
                  {metadata[name] ? `${metadata[name]} · ` : ""}
                  {name}
                </small>
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
      {!filtered.length && !checking && (
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
