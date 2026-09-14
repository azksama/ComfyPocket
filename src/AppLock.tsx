import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { native } from "./api";
type LockState = { supported: boolean; available: boolean; enabled: boolean; unlocked: boolean };
const desktop: LockState = { supported: false, available: false, enabled: false, unlocked: true };
async function status() { const value = await native<LockState | null>("lock_status"); if (!value && isTauri()) throw Error("État du verrouillage indisponible"); return value ?? desktop; }
let authenticationActive = false;
export function AppLock({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState | null>(null), [opened, setOpened] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), stateRef = useRef(state), first = useRef(true);
  const locked = !state || state.enabled && !state.unlocked;
  const apply = (s: LockState) => { stateRef.current = s; setState(s); if (!s.enabled || s.unlocked) setOpened(true); };
  const refresh = () => status().then(apply).catch(e => { setError(String(e)); apply({ supported: true, available: true, enabled: true, unlocked: false }); });
  const unlock = async () => {
    if (authenticationActive) return; authenticationActive = true; setBusy(true); setError("");
    try { apply(await native<LockState>("unlock")); } catch (e) { setError(String(e)); }
    finally { authenticationActive = false; setBusy(false); }
  };
  useEffect(() => {
    void refresh();
    const visibility = () => {
      if (document.hidden && stateRef.current?.enabled) { apply({ ...stateRef.current, unlocked: false }); if (!authenticationActive) void native("lock_session").catch(() => {}); }
      else if (!document.hidden) void refresh();
    };
    const change = () => void refresh();
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pocket-lock-changed", change);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pocket-lock-changed", change); };
  }, []);
  useEffect(() => {
    if (locked) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else dialog.current?.close();
    if (first.current && state) { first.current = false; if (state.enabled && !state.unlocked) void unlock(); }
  }, [locked, state]);
  return <><div className="protected-app" inert={locked} aria-hidden={locked} style={{ visibility: locked ? "hidden" : undefined }}>{opened ? children : null}</div>{locked && <dialog ref={dialog} className="lock-screen" aria-label="Application verrouillée" onCancel={e => e.preventDefault()}><span className="lock-emblem"><Fingerprint size={52} /></span><h1>Votre atelier privé.</h1><p>Déverrouillez Comfy Pocket pour retrouver vos créations.</p><button className="primary" disabled={busy || !state} onClick={() => void unlock()}><Fingerprint size={21} />{busy ? "Authentification…" : "Déverrouiller"}</button>{error && <p role="alert">{error}</p>}<small>Biométrie ou code de verrouillage Android</small></dialog>}</>;
}
export function LockSettings() {
  const [state, setState] = useState<LockState | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { void status().then(setState).catch(e => setError(String(e))); }, []);
  const change = async (enabled: boolean) => {
    if (authenticationActive) return; authenticationActive = true; setBusy(true); setError("");
    try { setState(await native<LockState>("set_biometric_lock", { enabled })); window.dispatchEvent(new Event("pocket-lock-changed")); } catch (e) { setError(String(e)); }
    finally { authenticationActive = false; setBusy(false); }
  };
  if (!state?.supported) return error ? <p role="alert">{error}</p> : null;
  return <section className="panel biometric-settings"><div className="section-heading"><h2>Accès à l’application</h2><Fingerprint size={23} /></div><label className="switch-row"><span><strong>Verrouillage biométrique</strong><small>Empreinte, visage ou code Android</small></span><input role="switch" aria-label="Activer le verrouillage biométrique" type="checkbox" checked={state.enabled} disabled={busy || !state.available} onChange={e => void change(e.target.checked)} /></label><p className="hint">Verrouillage au démarrage et au passage en arrière-plan. Les aperçus des applications récentes et les captures d’écran sont masqués tant que cette protection est activée.</p>{!state.available && <p className="hint">Configurez une empreinte, un visage ou un code de verrouillage dans les réglages Android.</p>}{state.enabled && <button onClick={() => void native("lock_session").then(() => window.dispatchEvent(new Event("pocket-lock-changed")))}><LockKeyhole size={17} /> Verrouiller maintenant</button>}{error && <p role="alert">{error}</p>}</section>;
}
