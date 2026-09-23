import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Minus,
  Square,
  X,
  FolderPlus,
  Download,
  RefreshCw,
} from "lucide-react";
import { version } from "../package.json";
export function WindowBar() {
  const action = (action: string) =>
    invoke("window_action", { action }).catch(() => {});
  return (
    <div className="window-bar">
      <div
        className="window-drag"
        onPointerDown={(e) => {
          if (e.button === 0) void action("drag");
        }}
        onDoubleClick={() => void action("maximize")}
      >
        <img src="/mochi.webp" alt="" />
        Mochi Studio
      </div>
      <button aria-label="Réduire" onClick={() => void action("minimize")}>
        <Minus size={17} />
      </button>
      <button
        aria-label="Agrandir ou restaurer"
        onClick={() => void action("maximize")}
      >
        <Square size={13} />
      </button>
      <button
        aria-label="Fermer"
        className="window-close"
        onClick={() => void action("close")}
      >
        <X size={18} />
      </button>
    </div>
  );
}
export const categories = {
  checkpoints: "Modèles",
  loras: "LoRAs",
  vae: "VAE",
  controlnet: "ControlNet",
  upscale_models: "Upscalers",
  embeddings: "Embeddings",
  text_encoders: "Encodeurs de texte · CLIP",
  diffusion_models: "Modèles de diffusion · UNet",
};
export function ModelPaths({
  value,
  onChange,
  onError,
  disabled,
}: {
  value: Record<string, string[]>;
  onChange: (v: Record<string, string[]>) => void;
  onError: (e: unknown) => void;
  disabled: boolean;
}) {
  async function add(kind: string) {
    try {
      const path = await invoke<string | null>("choose_directory");
      if (path && !(value[kind] || []).includes(path))
        onChange({ ...value, [kind]: [...(value[kind] || []), path] });
    } catch (e) {
      onError(e);
    }
  }
  return (
    <section className="settings-section">
      <h2>Dossiers supplémentaires</h2>
      <p className="muted">
        Ajoutés aux dossiers de ComfyUI au prochain démarrage. Vos fichiers
        restent à leur emplacement.
      </p>
      {Object.entries(categories).map(([kind, label]) => (
        <div className="model-path" key={kind}>
          <div className="section-heading">
            <strong>{label}</strong>
            <button
              disabled={disabled}
              onClick={() => void add(kind)}
              aria-label={`Ajouter un dossier ${label}`}
            >
              <FolderPlus size={18} />
              Ajouter
            </button>
          </div>
          {(value[kind] || []).map((path) => (
            <div className="path-entry" key={path}>
              <code>{path}</code>
              <button
                disabled={disabled}
                aria-label={`Retirer ${path}`}
                onClick={() =>
                  onChange({
                    ...value,
                    [kind]: value[kind].filter((p) => p !== path),
                  })
                }
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
export function Updates({
  automatic,
  disabled,
  onAvailable,
}: {
  automatic: boolean;
  disabled: boolean;
  onAvailable?: (value: boolean) => void;
}) {
  const [result, setResult] = useState<{
      version: string | null;
      notes?: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null);
  async function check() {
    setBusy(true);
    setError("");
    try {
      const r = await invoke<{ version: string | null; notes?: string }>(
        "check_update",
      );
      setResult(r);
      onAvailable?.(!!r.version);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (automatic) void check();
  }, [automatic]);
  useEffect(() => {
    const off = listen<number>("update-progress", (e) =>
      setProgress(e.payload),
    );
    return () => {
      void off.then((fn) => fn());
    };
  }, []);
  async function install() {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      await invoke("install_update");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <section className="settings-section">
      <h2>Mises à jour</h2>
      <p>Version installée · {version}</p>
      {error && (
        <p role="alert" className="update-error">
          {error}
        </p>
      )}
      {result && (
        <p role="status">
          {result.version
            ? `${result.version} est disponible.`
            : "Mochi Studio est à jour."}
        </p>
      )}
      {result?.notes && (
        <details>
          <summary>Nouveautés</summary>
          <div className="release-notes">{result.notes}</div>
        </details>
      )}
      <div className="actions">
        <button disabled={busy || disabled} onClick={() => void check()}>
          <RefreshCw size={18} />
          {busy && progress === null
            ? "Vérification…"
            : "Rechercher une mise à jour"}
        </button>
        {result?.version && (
          <button
            className="primary"
            disabled={busy || disabled}
            onClick={() => void install()}
          >
            <Download size={18} />
            {progress === null
              ? "Télécharger et installer"
              : `Téléchargement · ${progress} %`}
          </button>
        )}
      </div>
      {progress !== null && (
        <progress
          value={progress}
          max={100}
          aria-label="Téléchargement de la mise à jour"
        />
      )}
      <p className="muted">
        L’installation ferme le lanceur et arrête les services, puis rouvre
        Mochi. Une génération en cours empêche l’installation. Vos réglages et
        appairages sont conservés.
      </p>
    </section>
  );
}

export function ConnectionAddresses({
  urls,
  onExport,
  onNotice,
}: {
  urls: { kind: string; url: string }[];
  onExport: (kind: string) => void;
  onNotice: (notice: { error: boolean; text: string }) => void;
}) {
  return (
    <section
      className="services address-list"
      aria-label="Adresses de connexion"
    >
      <h2>Connecter Mochi à ce PC</h2>
      {urls.length ? (
        urls.map((u) => (
          <div className="connection" key={u.kind}>
            <div>
              <span className="eyebrow">
                {u.kind === "publique"
                  ? "CONNEXION PUBLIQUE"
                  : "CONNEXION LOCALE"}
              </span>
              <strong>{u.url}</strong>
              <small>
                {u.kind === "locale"
                  ? "Sur le même réseau Wi-Fi que votre PC."
                  : "Depuis l’extérieur, avec la redirection de port configurée sur votre routeur."}
              </small>
            </div>
            <div className="actions">
              <button
                aria-label={`Copier l’adresse ${u.kind}`}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(u.url)
                    .then(() =>
                      onNotice({ error: false, text: "Adresse copiée." }),
                    )
                    .catch(() =>
                      onNotice({ error: true, text: "Copie indisponible." }),
                    )
                }
              >
                Copier
              </button>
              <button onClick={() => onExport(u.kind)}>
                <Download size={17} />
                {u.kind === "publique" ? "Appairage public" : "Appairage local"}
              </button>
            </div>
          </div>
        ))
      ) : (
        <p>Aucun appairage trouvé dans la configuration de ce PC.</p>
      )}
      {!urls.some((u) => u.kind === "publique") && (
        <p className="muted">Aucun appairage public configuré sur ce PC.</p>
      )}
    </section>
  );
}
