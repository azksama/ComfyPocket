import "./settings-hub.css";
import { useEffect, useState } from "react";
import { api, native } from "./api";
import { t } from "./i18n";
import type { PromptOptimizer } from "./promptOptimizer";

type Job = {
  id: string;
  phase: string;
  error?: string;
  text?: string;
  blocks?: { title: string; text: string; side: "positive" | "negative" }[];
};
export type VoiceStatus = {
  supported: boolean;
  connected: boolean;
  runtimeReady: boolean;
  ready: boolean;
  phase: string;
  size: number;
  received: number;
  error?: string;
  taggerReady: boolean;
  model: string;
  device: string;
  downloadId?: string;
  models: { id: string; size: number; installed: boolean; repo: string }[];
};
let localPhase = "idle";
const refresh = () => window.dispatchEvent(new Event("mochi-voice"));
const setPhase = (phase: string) => {
  localPhase = phase;
  refresh();
};
export const voiceAction = (action: string) =>
  native<{ supported: boolean; phase: string; error?: string; audio?: string }>(
    "voice_action",
    { action },
  );

export function useVoiceStatus() {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      reading = false;
    const read = async () => {
      if (document.hidden || reading) return;
      reading = true;
      try {
        const pc = await api<VoiceStatus>("/bridge/assistant");
        if (!pc?.supported || !Array.isArray(pc.models))
          throw Error("Companion update required");
        const recorder = await voiceAction("status").catch(() => ({
          supported: false,
        }));
        if (alive)
          setStatus({
            ...pc,
            connected: true,
            supported: pc.supported && recorder.supported,
            phase: localPhase === "idle" ? pc.phase : localPhase,
          });
      } catch {
        if (alive) setStatus(null);
      } finally {
        reading = false;
      }
    };
    void read();
    const timer = setInterval(read, 1500);
    window.addEventListener("mochi-voice", read);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("mochi-voice", read);
    };
  }, []);
  const run = async (action: string, args: Record<string, unknown> = {}) => {
    setError("");
    try {
      if (action === "configure") await api("/bridge/assistant/settings", args);
      else if (action === "cancel")
        await api("/bridge/assistant/cancel", { id: status?.downloadId });
      else if (action === "download") {
        const job = await api<Job>("/bridge/assistant/jobs", {
          action,
          ...args,
        });
        setStatus((s) =>
          s ? { ...s, phase: "downloading", downloadId: job.id } : s,
        );
      }
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };
  return { status, error, run };
}

export default function VoiceModels() {
  const { status, error, run } = useVoiceStatus();
  const busy = status?.phase === "downloading";
  const [saving, setSaving] = useState(false);
  const configure = async (next: { model: string; device: string }) => {
    setSaving(true);
    try {
      await run("configure", next);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="voice-models">
      <p>
        {t(
          "Whisper et DanbotNL s’exécutent sur votre PC. Aucun de ces modèles n’est téléchargé sur le téléphone.",
        )}
      </p>
      {!status?.connected ? (
        <p role="status">
          {t(
            "Connectez votre PC. Si le compagnon est ancien, mettez Mochi Studio à jour.",
          )}
        </p>
      ) : (
        <>
          {!status.runtimeReady && (
            <p role="alert">
              {t(
                "Le moteur Python du PC est introuvable. Vérifiez le dossier ComfyUI dans Mochi Studio.",
              )}
            </p>
          )}
          <label>
            {t("Modèle Whisper")}
            <select
              value={status.model}
              disabled={busy || saving}
              onChange={(e) =>
                void configure({ model: e.target.value, device: status.device })
              }
            >
              <option value="small">Whisper Small · {t("Rapide")}</option>
              <option value="medium">Whisper Medium · {t("Équilibré")}</option>
              <option value="large-v3">
                Whisper Large v3 · {t("Précision")}
              </option>
            </select>
          </label>
          <label>
            {t("Calcul sur le PC")}
            <select
              value={status.device}
              disabled={busy || saving}
              onChange={(e) =>
                void configure({ model: status.model, device: e.target.value })
              }
            >
              <option value="auto">
                {t("Automatique (GPU si disponible)")}
              </option>
              <option value="cuda">GPU NVIDIA</option>
              <option value="cpu">CPU</option>
            </select>
          </label>
          {[
            {
              id: status.model,
              title: `Whisper ${status.model}`,
              target: "whisper",
            },
            { id: "danbot", title: "DanbotNL · 260M", target: "danbot" },
          ].map((entry) => {
            const model = status.models?.find((m) => m.id === entry.id);
            return (
              <article key={entry.id}>
                <h3>{entry.title}</h3>
                <p>
                  {entry.target === "whisper"
                    ? t("Dictée française ou anglaise, transcrite en anglais.")
                    : t(
                        "Texte vers tags Danbooru. Inclut la traduction du texte français sur le PC.",
                      )}
                </p>
                <strong>
                  {model?.installed
                    ? t("Installé sur le PC")
                    : `${Math.ceil((model?.size || 0) / 1000000)} Mo`}
                </strong>
                <button
                  disabled={busy || saving || !status.runtimeReady}
                  onClick={() => void run("download", { target: entry.target })}
                >
                  {model?.installed
                    ? t("Réinstaller sur le PC")
                    : t("Télécharger sur le PC")}
                </button>
              </article>
            );
          })}
          {busy && (
            <div role="status">
              <progress
                value={status.received}
                max={Math.max(1, status.size)}
                aria-label={t("Téléchargement sur le PC")}
              />
              <p>
                {Math.round((status.received / Math.max(1, status.size)) * 100)}{" "}
                %
              </p>
              <button onClick={() => void run("cancel")}>{t("Annuler")}</button>
            </div>
          )}
          <p className="hint">
            {t(
              "Les modèles sont libérés après traitement pour laisser la mémoire à ComfyUI.",
            )}
          </p>
        </>
      )}
      {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    </div>
  );
}

async function waitForJob(job: Job, signal: AbortSignal): Promise<Job> {
  const cancel = () => {
    void api("/bridge/assistant/cancel", { id: job.id }).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) {
      cancel();
      throw new DOMException("Cancelled", "AbortError");
    }
    const deadline = Date.now() + 6 * 60 * 1000;
    while (!signal.aborted && Date.now() < deadline) {
      if (job.phase === "complete") return job;
      if (job.phase === "error" || job.phase === "cancelled")
        throw Error(job.error || t("Traitement interrompu."));
      await new Promise((resolve) => setTimeout(resolve, 500));
      job = await api<Job>(
        `/bridge/assistant/job?id=${encodeURIComponent(job.id)}`,
      );
    }
    cancel();
    throw new DOMException("Cancelled", "AbortError");
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

export const pcOptimizer: PromptOptimizer = {
  name: "DanbotNL",
  async optimize(input, signal) {
    const result = await waitForJob(
      await api<Job>("/bridge/assistant/jobs", {
        action: "optimize",
        ...input,
      }),
      signal,
    );
    return { blocks: result.blocks || [] };
  },
};

export async function dictate(
  language: "fr" | "en",
  signal: AbortSignal,
): Promise<string> {
  const cancel = () => {
    void voiceAction("cancel").catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const pc = await api<VoiceStatus>("/bridge/assistant");
    if (!pc.ready)
      throw Error(t("Téléchargez Whisper sur le PC avant de dicter."));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    await voiceAction("start");
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    setPhase("recording");
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const recording = await voiceAction("status");
      if (recording.phase === "error") throw Error(recording.error);
      if (recording.phase === "idle") throw Error(t("Dictée interrompue."));
      if (recording.phase === "complete") {
        const { audio } = await voiceAction("take");
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        setPhase("processing");
        const result = await waitForJob(
          await api<Job>("/bridge/assistant/jobs", {
            action: "transcribe",
            language,
            audio,
          }),
          signal,
        );
        return result.text || "";
      }
    }
    throw new DOMException("Cancelled", "AbortError");
  } finally {
    cancel();
    setPhase("idle");
    signal.removeEventListener("abort", cancel);
  }
}
