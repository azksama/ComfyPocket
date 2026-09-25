import { useEffect, useRef, useState } from "react";
import { native } from "./api";
import { Modal } from "./Modal";
import { t } from "./i18n";
import { version } from "../package.json";
export type UpdateStatus = {
  supported: boolean;
  phase: string;
  error?: string;
  received: number;
  ready: boolean;
  available: boolean;
  canInstall: boolean;
  permissionRequired?: boolean;
  release?: { version: string; size: number };
};
const act = (action: string) =>
  native<UpdateStatus>("update_action", { action });
function autoEnabled() {
  try {
    return localStorage.getItem("mochi-update-auto") !== "false";
  } catch {
    return true;
  }
}
export function UpdateSettings() {
  const [automatic, setAutomatic] = useState(autoEnabled);
  return (
    <div className="update-settings">
      <p>Mochi {version}</p>
      <label className="switch-row">
        <span>{t("Vérifier automatiquement les mises à jour")}</span>
        <input
          type="checkbox"
          role="switch"
          checked={automatic}
          onChange={(e) => {
            setAutomatic(e.target.checked);
            try {
              localStorage.setItem(
                "mochi-update-auto",
                String(e.target.checked),
              );
            } catch {}
          }}
        />
      </label>
      <button onClick={() => window.dispatchEvent(new Event("mochi-update"))}>
        {t("Rechercher une mise à jour")}
      </button>
    </div>
  );
}
export default function AppUpdater() {
  const [state, setState] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const current = useRef(state);
  current.current = state;
  const seen = useRef("");
  const alive = useRef(true);
  const started = useRef(false);
  async function run(action: string) {
    setError("");
    try {
      const next = await act(action);
      if (alive.current) setState(next);
      return next;
    } catch (e) {
      if (alive.current) setError(String(e));
      return null;
    }
  }
  useEffect(() => {
    alive.current = true;
    const check = async (manual: boolean) => {
      if (started.current) return;
      if (!manual) {
        if (document.hidden || !autoEnabled()) return;
        try {
          if (
            Date.now() -
              Number(localStorage.getItem("mochi-update-check") || 0) <
            6 * 3600000
          )
            return;
        } catch {}
      }
      started.current = true;
      if (manual) setOpen(true);
      setChecking(true);
      const s = await run("check");
      if (s?.supported) {
        try {
          localStorage.setItem("mochi-update-check", String(Date.now()));
        } catch {}
      }
      setChecking(false);
      started.current = false;
    };
    const manual = () => void check(true);
    const visible = () => {
      if (!document.hidden) void check(false);
    };
    const timeout = setTimeout(() => void check(false), 3000);
    const interval = setInterval(() => {
      if (document.hidden) return;
      if (!current.current?.supported) return;
      void act("status")
        .then((s) => {
          if (!alive.current) return;
          setState(s);
          if (
            s.available &&
            s.phase !== "checking" &&
            s.release?.version !== seen.current
          ) {
            seen.current = s.release?.version || "";
            setOpen(true);
          }
        })
        .catch(() => {});
    }, 1500);
    window.addEventListener("mochi-update", manual);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener("mochi-update", manual);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  if (!open) return null;
  const busy =
    checking || state?.phase === "checking" || state?.phase === "downloading";
  return (
    <Modal
      title={t("Mise à jour de Mochi")}
      className="update-dialog"
      onClose={() => setOpen(false)}
    >
      {checking || state?.phase === "checking" ? (
        <p role="status">{t("Recherche sur GitHub…")}</p>
      ) : !state?.supported ? (
        <p>{t("Les mises à jour intégrées sont disponibles sur Android.")}</p>
      ) : state.available && state.release ? (
        <>
          <h3>Mochi {state.release.version}</h3>
          <p>{t("Voulez-vous télécharger et installer cette mise à jour ?")}</p>
          <p>{(state.release.size / 1_000_000).toFixed(1)} Mo</p>
          {state.phase === "downloading" && (
            <>
              <progress
                max={state.release.size}
                value={state.received}
                aria-label={t("Téléchargement de la mise à jour")}
              />
              <button onClick={() => void run("cancel")}>
                {t("Annuler le téléchargement")}
              </button>
            </>
          )}
          {state.ready ? (
            <>
              <p>
                {t(
                  "Téléchargement vérifié. Android vous demandera de confirmer l’installation.",
                )}
              </p>
              {!state.canInstall && (
                <p>
                  {t(
                    "Autorisez Mochi à installer ses mises à jour dans les réglages Android, puis revenez ici.",
                  )}
                </p>
              )}
              <button
                className="primary"
                disabled={installing}
                onClick={async () => {
                  setInstalling(true);
                  await run("install");
                  setInstalling(false);
                }}
              >
                {state.canInstall
                  ? t("Installer la mise à jour")
                  : t("Autoriser l’installation")}
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run("download")}
            >
              {t("Télécharger la mise à jour")}
            </button>
          )}
          <button onClick={() => setOpen(false)}>{t("Plus tard")}</button>
        </>
      ) : (
        <p>
          {state?.phase === "error"
            ? t("La vérification a échoué. Réessayez plus tard.")
            : t("Mochi est à jour.")}
        </p>
      )}
      {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
    </Modal>
  );
}
