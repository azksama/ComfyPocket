import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { native } from "./api";
import { MochiMascot, StartupSplash } from "./MochiMascot";

type LockState = {
  delaySeconds?: number;
  hideRecents?: boolean;
  supported: boolean;
  available: boolean;
  enabled: boolean;
  unlocked: boolean;
};
const desktop: LockState = {
  supported: false,
  available: false,
  enabled: false,
  unlocked: true,
};
const unavailable: LockState = {
  supported: true,
  available: true,
  enabled: true,
  unlocked: false,
};
const lockChanged = "pocket-lock-changed";
let authenticationActive = false;
async function status() {
  const value = await native<LockState | null>("lock_status");
  if (!value && isTauri()) throw Error("État du verrouillage indisponible");
  return value ?? desktop;
}
function autoPromptEnabled() {
  try {
    return localStorage.getItem("biometric-auto-prompt") !== "false";
  } catch {
    return true;
  }
}

export function AppLock({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState | null>(null);
  const [opened, setOpened] = useState(false);
  const [launching, setLaunching] = useState(true);
  const finishLaunch = useCallback(() => setLaunching(false), []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const stateRef = useRef(state),
    first = useRef(true),
    revision = useRef(0),
    mounted = useRef(true);
  const locked = !state || (state.enabled && !state.unlocked);
  const shielded = locked || launching;

  const apply = useCallback((value: LockState) => {
    if (!mounted.current) return;
    // The native lifecycle owns the expiry timer. Hide the UI while backgrounded
    // without expiring an otherwise valid native session.
    const visible =
      value.enabled && document.hidden ? { ...value, unlocked: false } : value;
    stateRef.current = visible;
    setState(visible);
    if (!visible.enabled || visible.unlocked) setOpened(true);
  }, []);
  const refresh = useCallback(async () => {
    if (authenticationActive || document.hidden) return;
    const id = ++revision.current;
    try {
      const value = await status();
      if (id === revision.current && mounted.current) {
        setError("");
        apply(value);
      }
    } catch (e) {
      if (id === revision.current && mounted.current) {
        setError(String(e));
        apply(unavailable);
      }
    }
  }, [apply]);
  const unlock = useCallback(async () => {
    if (authenticationActive) return;
    ++revision.current;
    authenticationActive = true;
    setBusy(true);
    setError("");
    try {
      apply(await native<LockState>("unlock"));
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      authenticationActive = false;
      if (mounted.current) setBusy(false);
    }
  }, [apply]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visibility = () => {
      if (document.hidden) {
        ++revision.current;
        if (stateRef.current?.enabled)
          apply({ ...stateRef.current, unlocked: false });
      } else void refresh();
    };
    const change = () => void refresh();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener(lockChanged, change);
    return () => {
      mounted.current = false;
      ++revision.current;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener(lockChanged, change);
    };
  }, [refresh, apply]);
  useEffect(() => {
    if (shielded) {
      if (!dialog.current?.open) dialog.current?.showModal();
    } else dialog.current?.close();
    if (first.current && state && !launching) {
      first.current = false;
      if (state.enabled && !state.unlocked && autoPromptEnabled())
        void unlock();
    }
  }, [shielded, launching, state, unlock]);

  return (
    <>
      <div
        className="protected-app"
        inert={shielded}
        aria-hidden={shielded}
        style={{ visibility: shielded ? "hidden" : undefined }}
      >
        {opened ? children : null}
      </div>
      {shielded && (
        <dialog
          ref={dialog}
          className="lock-screen"
          aria-label={launching ? "Démarrage" : "Application verrouillée"}
          onCancel={(e) => e.preventDefault()}
        >
          {launching ? (
            <StartupSplash onDone={finishLaunch} />
          ) : (
            <>
              <MochiMascot />
              <h1>Mochi est enfermé</h1>
              <p>Libérez-le pour retrouver vos créations.</p>
              <button
                className="primary"
                disabled={busy || !state}
                onClick={() => void unlock()}
              >
                <Fingerprint size={21} />
                {busy ? "Authentification…" : "Le libérer"}
              </button>
              {error && <p role="alert">{error}</p>}
              <small>Biométrie ou code de verrouillage Android</small>
            </>
          )}
        </dialog>
      )}
    </>
  );
}

export function LockSettings() {
  const [state, setState] = useState<LockState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState(autoPromptEnabled);
  const operation = useRef(false),
    revision = useRef(0),
    mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      if (document.hidden || operation.current) return;
      const id = ++revision.current;
      try {
        const value = await status();
        if (mounted.current && id === revision.current) setState(value);
      } catch (e) {
        if (mounted.current && id === revision.current) setError(String(e));
      }
    };
    void refresh();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(lockChanged, refresh);
    return () => {
      mounted.current = false;
      ++revision.current;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(lockChanged, refresh);
    };
  }, []);
  const update = async (
    command: string,
    args: Record<string, unknown> = {},
    authenticate = false,
  ) => {
    if (operation.current || authenticationActive) return;
    operation.current = true;
    ++revision.current;
    if (authenticate) authenticationActive = true;
    setBusy(true);
    setError("");
    try {
      const value = await native<LockState>(command, args);
      if (mounted.current) setState(value);
    } catch (e) {
      if (mounted.current) setError(String(e));
    } finally {
      operation.current = false;
      if (authenticate) authenticationActive = false;
      if (mounted.current) setBusy(false);
      window.dispatchEvent(new Event(lockChanged));
    }
  };
  if (!state?.supported) return error ? <p role="alert">{error}</p> : null;
  return (
    <section className="panel biometric-settings">
      <div className="section-heading">
        <h2>Sécurité & confidentialité</h2>
        <Fingerprint size={23} />
      </div>
      <label className="switch-row">
        <span>
          <strong>Verrouillage biométrique</strong>
          <small>Empreinte, visage ou code Android</small>
        </span>
        <input
          role="switch"
          aria-label="Activer le verrouillage biométrique"
          type="checkbox"
          checked={state.enabled}
          disabled={busy || !state.available}
          onChange={(e) =>
            void update(
              "set_biometric_lock",
              { enabled: e.target.checked },
              true,
            )
          }
        />
      </label>
      <p className="hint">
        Verrouillage à chaque nouveau démarrage et après le délai choisi en
        arrière-plan. Les captures d’écran sont autorisées.
      </p>
      <label>
        Verrouiller après
        <select
          value={state.delaySeconds ?? 0}
          disabled={busy || !state.enabled}
          onChange={(e) =>
            void update("set_lock_options", {
              delaySeconds: Number(e.target.value),
              hideRecents: state.hideRecents ?? true,
            })
          }
        >
          {[
            [0, "Immédiatement"],
            [30, "30 secondes"],
            [60, "1 minute"],
            [300, "5 minutes"],
            [900, "15 minutes"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="switch-row">
        <span>
          Masquer l’aperçu des applications récentes
          <small>Android 13 et versions suivantes</small>
        </span>
        <input
          role="switch"
          type="checkbox"
          checked={state.hideRecents ?? true}
          disabled={busy || !state.enabled}
          onChange={(e) =>
            void update("set_lock_options", {
              delaySeconds: state.delaySeconds ?? 0,
              hideRecents: e.target.checked,
            })
          }
        />
      </label>
      <label className="switch-row">
        <span>Demander la biométrie au démarrage</span>
        <input
          role="switch"
          type="checkbox"
          checked={autoPrompt}
          disabled={busy || !state.enabled}
          onChange={(e) => {
            try {
              localStorage.setItem(
                "biometric-auto-prompt",
                String(e.target.checked),
              );
              setAutoPrompt(e.target.checked);
              setError("");
            } catch {
              setError(
                "Impossible d’enregistrer cette préférence sur l’appareil.",
              );
            }
          }}
        />
      </label>
      {!state.available && (
        <p className="hint">
          Configurez une empreinte, un visage ou un code de verrouillage dans
          les réglages Android.
        </p>
      )}
      {state.enabled && (
        <button
          className="lock-now"
          disabled={busy}
          onClick={() => void update("lock_session")}
        >
          <LockKeyhole size={17} /> Verrouiller maintenant
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
