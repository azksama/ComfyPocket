import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Star, X } from "lucide-react";
import { api } from "./api";
import { Picture, modelPath, shortName } from "./components";

type Description = {
  title?: string;
  baseModel?: string;
  version?: string;
  triggers?: string[];
};
function useDescription(kind: string, name: string) {
  const [description, setDescription] = useState<Description>({});
  useEffect(() => {
    let live = true;
    setDescription({});
    if (name)
      void api<Description>(
        `/bridge/model-info?kind=${kind}&name=${encodeURIComponent(name)}`,
      )
        .then((value) => {
          if (live) setDescription(value ?? {});
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [kind, name]);
  return description;
}

export function StudioModel({
  name,
  onBrowse,
  refreshKey,
}: {
  name: string;
  onBrowse: () => void;
  refreshKey: number;
}) {
  const info = useDescription("checkpoints", name);
  const [favorite, setFavorite] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    revision = useRef(0);
  useEffect(() => {
    const version = ++revision.current;
    setReady(false);
    setFavorite(false);
    setError("");
    void api<Record<string, string[]>>("/bridge/model-favorites")
      .then((data) => {
        if (version === revision.current) {
          setFavorite((data.checkpoints ?? []).includes(name));
          setReady(true);
        }
      })
      .catch(() => {});
    return () => {
      revision.current++;
    };
  }, [name, refreshKey]);
  async function toggle() {
    if (!ready || pending.current) return;
    pending.current = true;
    setReady(false);
    setError("");
    const version = revision.current;
    try {
      const data = await api<Record<string, string[]>>(
        "/bridge/model-favorites",
        { kind: "checkpoints", name, favorite: !favorite },
      );
      if (version === revision.current)
        setFavorite((data.checkpoints ?? []).includes(name));
    } catch {
      if (version === revision.current)
        setError("Le favori n’a pas pu être enregistré.");
    } finally {
      pending.current = false;
      if (version === revision.current) setReady(true);
    }
  }
  return (
    <section id="studio-model" tabIndex={-1}>
      <div className="studio-section-heading">
        <h2>Modèle</h2>
        <button className="inline-action" onClick={onBrowse}>
          Parcourir les modèles
        </button>
      </div>
      <div className="studio-model">
        <button
          className="model-select"
          onClick={onBrowse}
          aria-label={
            name
              ? `Changer de modèle : ${shortName(name)}`
              : "Choisir un modèle"
          }
        >
          <Picture path={modelPath("checkpoints", name)} alt="" thumbnail />
          <span>
            <strong>{name ? shortName(name) : "Choisir un modèle"}</strong>
            <small>
              Checkpoint{info.baseModel ? ` · ${info.baseModel}` : ""}
            </small>
          </span>
          <ChevronDown size={17} />
        </button>
        {name && (
          <button
            className="model-favorite"
            aria-pressed={favorite}
            disabled={!ready}
            onClick={() => void toggle()}
          >
            <Star size={14} fill={favorite ? "currentColor" : "none"} />
            {favorite ? "Favori" : "Ajouter aux favoris"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="hint">
          {error}
        </p>
      )}
    </section>
  );
}

export function StudioLora({
  name,
  strength,
  index,
  onChange,
  onRemove,
  onTrigger,
}: {
  name: string;
  strength: number;
  index: number;
  onChange: (strength: number) => void;
  onRemove: () => void;
  onTrigger: (tag: string) => void;
}) {
  const info = useDescription("loras", name);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const previousStrength = useRef(1);
  if (Number.isFinite(strength) && strength !== 0)
    previousStrength.current = strength;
  return (
    <article className="studio-lora lora-row">
      <div className="lora-heading">
        <Picture path={modelPath("loras", name)} alt="" thumbnail />
        <span>
          <h3>{shortName(name)}</h3>
          <small>LoRA{info.baseModel ? ` · ${info.baseModel}` : ""}</small>
        </span>
        <input
          className="lora-toggle"
          type="checkbox"
          role="switch"
          aria-label={`Activer ${shortName(name)}`}
          checked={strength !== 0}
          onChange={(e) =>
            onChange(e.target.checked ? previousStrength.current : 0)
          }
        />
        <button
          className="icon-action"
          aria-label={`Retirer ${shortName(name)}`}
          onClick={onRemove}
        >
          <X size={15} />
        </button>
      </div>
      {!!info.triggers?.length && (
        <div className="lora-triggers">
          <small>Déclencheur</small>
          {info.triggers.map((tag) => (
            <button key={tag} onClick={() => onTrigger(tag)}>
              {tag} +
            </button>
          ))}
          <button
            className="icon-action"
            aria-label="Copier les déclencheurs"
            onClick={() => {
              setCopied(false);
              setCopyError(false);
              void navigator.clipboard
                .writeText(info.triggers!.join(", "))
                .then(() => setCopied(true))
                .catch(() => setCopyError(true));
            }}
          >
            <Copy size={12} />
          </button>
          {copied && <small role="status">Copié</small>}
          {copyError && <small role="alert">Copie indisponible</small>}
        </div>
      )}
      <div className="lora-strength">
        <span>Intensité</span>
        <input
          type="range"
          aria-label={`Intensité LoRA ${index + 1}`}
          min={-4}
          max={4}
          step={0.05}
          value={Number.isFinite(strength) ? strength : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          aria-label={`Poids LoRA ${index + 1}`}
          min={-4}
          max={4}
          step={0.05}
          value={Number.isFinite(strength) ? strength : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? NaN : Number(e.target.value))
          }
        />
      </div>
    </article>
  );
}
