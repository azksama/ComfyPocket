import { CivitaiBrowser } from "./CivitaiBrowser";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Link,
  LoaderCircle,
  RefreshCw,
  X,
  Check,
} from "lucide-react";
import { api, type ObjectInfo } from "./api";
import { Modal } from "./Modal";
import { t } from "./i18n";
import "./ModelImports.css";
type Job = {
  id: string;
  name: string;
  kind: string;
  status: string;
  received: number;
  total: number | null;
  error?: string;
  illustration?: string;
};
type Snapshot = { revision: number; jobs: Job[] };
type Plan = {
  id: string;
  title: string;
  provider: string;
  files: {
    id: string;
    name: string;
    label: string;
    kind: string;
    size: number | null;
    baseModel: string;
  }[];
};
const categories: Record<string, string> = {
  checkpoints: "Modèle / Checkpoint",
  loras: "LoRA / LyCORIS",
  vae: "VAE",
  upscale_models: "Upscaler",
  embeddings: "Embedding",
  controlnet: "ControlNet",
  diffusion_models: "Modèle de diffusion / UNet",
  text_encoders: "Encodeur de texte / CLIP",
  clip_vision: "CLIP Vision",
};
const labels: Record<string, string> = {
  queued: "En attente",
  downloading: "Téléchargement",
  verifying: "Vérification",
  completed: "Installé sur le PC",
  cancelled: "Annulé",
  error: "Échec",
};
const active = (j: Job) =>
  ["queued", "downloading", "verifying"].includes(j.status);
const bytes = (n: number | null) =>
  n === null
    ? t("Taille inconnue")
    : n < 1024 ** 2
      ? `${Math.round(n / 1024)} Ko`
      : `${(n / 1024 ** (n < 1024 ** 3 ? 2 : 3)).toFixed(1)} ${n < 1024 ** 3 ? "Mo" : "Go"}`;
export function useModelImports(
  server: string,
  onCatalog: (info: ObjectInfo) => void,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ revision: 0, jobs: [] });
  const [error, setError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [browserSupported, setBrowserSupported] = useState<boolean | null>(
    null,
  );
  const catalog = useRef(onCatalog);
  catalog.current = onCatalog;
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let live = true,
      polling = false,
      revision = -1,
      known: boolean | null = null;
    setSnapshot({ revision: 0, jobs: [] });
    setSupported(null);
    setBrowserSupported(null);
    setError("");
    setSyncError("");
    const poll = async () => {
      if (!server || polling || !live) return;
      polling = true;
      try {
        if (known === null) {
          const info = await api<{
            modelImports?: boolean;
            civitaiBrowser?: boolean;
          }>("/bridge/info");
          known = !!info.modelImports;
          if (live) {
            setSupported(known);
            setBrowserSupported(known && !!info.civitaiBrowser);
          }
        }
        if (!known) return;
        const result = await api<Snapshot>("/bridge/imports");
        if (!live) return;
        setSnapshot(result);
        setError("");
        if (result.revision !== revision) {
          try {
            const info = await api<ObjectInfo>("/api/object_info");
            if (live) {
              catalog.current(info);
              revision = result.revision;
              setSyncError("");
            }
          } catch {
            if (live)
              setSyncError(
                t(
                  "Fichier installé ; actualisation du catalogue en attente du moteur.",
                ),
              );
          }
        }
      } catch (e) {
        if (live) setError(String(e));
      } finally {
        polling = false;
      }
    };
    refresh.current = poll;
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [server]);
  return {
    snapshot,
    error,
    syncError,
    supported,
    browserSupported,
    refresh: () => refresh.current(),
  };
}
export default function ModelImports({
  state,
  onClose,
}: {
  state: ReturnType<typeof useModelImports>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"link" | "civitai">("civitai");
  const [url, setUrl] = useState(""),
    [token, setToken] = useState(""),
    [plan, setPlan] = useState<Plan | null>(null);
  const [fileId, setFileId] = useState(""),
    [kind, setKind] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = plan?.files.find((f) => f.id === fileId);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function inspect(link = url) {
    setBusy(true);
    setError("");
    setPlan(null);
    try {
      const result = await api<Plan>("/bridge/imports/inspect", {
        url: link,
        token,
      });
      if (!mounted.current) return;
      setPlan(result);
      setFileId(result.files[0].id);
      setKind(result.files[0].kind);
      if (tab === "link") setToken("");
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function start() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      await api("/bridge/imports/start", { planId: plan.id, fileId, kind });
      if (mounted.current) {
        setPlan(null);
        setUrl("");
      }
      await state.refresh();
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Modal
      title={t("Installer sur le PC")}
      onClose={onClose}
      className="model-imports full-page-dialog"
    >
      <div className="import-content">
        {state.supported === false && (
          <p role="alert">
            {t(
              "Mettez à jour Mochi Studio sur le PC pour importer des modèles.",
            )}
          </p>
        )}
        <div
          className="import-tabs"
          role="group"
          aria-label={t("Source du modèle")}
        >
          <button
            aria-pressed={tab === "civitai"}
            onClick={() => setTab("civitai")}
          >
            Civitai
          </button>
          <button aria-pressed={tab === "link"} onClick={() => setTab("link")}>
            {t("Depuis un lien")}
          </button>
        </div>
        {tab === "civitai" &&
          state.supported !== false &&
          (state.browserSupported === false ? (
            <p role="alert">
              {t(
                "Mettez à jour Mochi Studio sur le PC pour explorer Civitai. L’installation depuis un lien reste disponible.",
              )}
            </p>
          ) : (
            <>
              <details>
                <summary>
                  {t("Clé d’accès du fournisseur (facultatif)")}
                </summary>
                <label>
                  {t("Clé Civitai")}
                  <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
                <small>
                  {t(
                    "La clé est conservée uniquement pendant cette ouverture du catalogue.",
                  )}
                </small>
              </details>
              <CivitaiBrowser
                token={token}
                disabled={busy || state.browserSupported !== true}
                onInstall={(link) => {
                  setUrl(link);
                  setTab("link");
                  void inspect(link);
                }}
              />
            </>
          ))}
        {tab === "link" && (
          <>
            <p className="muted">
              {t(
                "Collez un lien Civitai (.com ou .red) ou Hugging Face. Le PC télécharge le fichier, même si vous quittez l’application.",
              )}
            </p>
            {state.supported !== false && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void inspect();
                }}
              >
                <label>
                  {t("Lien du modèle ou du fichier")}
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://civitai.com/models/…"
                    value={url}
                    disabled={busy}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setPlan(null);
                    }}
                    required
                  />
                </label>
                <details>
                  <summary>
                    {t("Clé d’accès du fournisseur (facultatif)")}
                  </summary>
                  <label>
                    {t("Clé Civitai ou Hugging Face")}
                    <input
                      type="password"
                      autoComplete="off"
                      value={token}
                      disabled={busy}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setPlan(null);
                      }}
                    />
                  </label>
                  <small>
                    {t(
                      "Utilisée pour cet import uniquement, jamais enregistrée sur disque. Les conditions d’accès du fournisseur restent applicables.",
                    )}
                  </small>
                </details>
                <button
                  type="submit"
                  className="primary"
                  disabled={busy || !url.trim() || state.supported !== true}
                >
                  {busy ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Link size={18} />
                  )}{" "}
                  {t("Analyser le lien")}
                </button>
              </form>
            )}
          </>
        )}
        {(error || state.error) && (
          <p className="import-error" role="alert">
            {error || state.error}
          </p>
        )}
        {state.syncError && <p role="status">{state.syncError}</p>}
        {plan && (
          <section className="import-plan">
            <h3>{plan.title}</h3>
            <label>
              {t("Fichier à installer")}
              <select
                value={fileId}
                disabled={busy}
                onChange={(e) => {
                  setFileId(e.target.value);
                  setKind(
                    plan.files.find((f) => f.id === e.target.value)?.kind || "",
                  );
                }}
              >
                {plan.files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Installer comme")}
              <select
                value={kind}
                disabled={busy}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">{t("Choisir la catégorie")}</option>
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {bytes(selected?.size ?? null)}
              {selected?.baseModel ? ` · ${selected.baseModel}` : ""}
            </p>
            <small>
              {t(
                "Le dossier configuré sur le PC est utilisé. Vérifiez le type et la compatibilité du modèle avec votre workflow. Aucun fichier existant n’est remplacé.",
              )}
            </small>
            <button
              className="primary"
              disabled={busy || !kind}
              onClick={() => void start()}
            >
              <Download size={18} />
              {t("Télécharger et installer")}
            </button>
          </section>
        )}
        <section className="import-history">
          <div className="import-heading">
            <h3>{t("Téléchargements sur le PC")}</h3>
            <button
              aria-label={t("Actualiser les téléchargements")}
              onClick={() => void state.refresh()}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {!state.snapshot.jobs.length && (
            <p className="muted">{t("Aucun téléchargement pour le moment.")}</p>
          )}
          {[...state.snapshot.jobs].reverse().map((job) => (
            <article className="import-job" key={job.id}>
              <div className="import-heading">
                <strong>{job.name}</strong>
                {active(job) ? (
                  <button
                    aria-label={t("Annuler le téléchargement de {0}", [
                      job.name,
                    ])}
                    onClick={() =>
                      void api("/bridge/imports/cancel", { id: job.id })
                        .then(state.refresh)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    <X size={18} />
                  </button>
                ) : job.status === "completed" ? (
                  <Check size={20} aria-hidden="true" />
                ) : null}
              </div>
              <span>
                {t(categories[job.kind] || job.kind)} ·{" "}
                {t(labels[job.status] || job.status)}
              </span>
              {active(job) && (
                <>
                  <progress
                    aria-label={t("Progression de {0}", [job.name])}
                    value={job.total ? job.received : undefined}
                    max={job.total || 1}
                  />
                  <small>
                    {bytes(job.received)} / {bytes(job.total)}
                  </small>
                </>
              )}
              {job.status === "completed" &&
                job.illustration === "downloaded" && (
                  <small>{t("Illustration installée")}</small>
                )}
              {job.status === "completed" && job.illustration === "failed" && (
                <small>
                  {t("Illustration indisponible ; le modèle reste utilisable.")}
                </small>
              )}
              {job.error && <p className="import-error">{job.error}</p>}
            </article>
          ))}
        </section>
      </div>
    </Modal>
  );
}
