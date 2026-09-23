import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke as nativeInvoke } from "@tauri-apps/api/core";
import { previewSettings, previewStatus } from "./preview";
import {
  Sparkles,
  Smartphone,
  SlidersHorizontal,
  ScrollText,
  Play,
  Square,
  RefreshCw,
  FolderOpen,
  Download,
  Check,
  CircleAlert,
  Cpu,
  ArrowUpRight,
  ShieldCheck,
  Copy,
  LoaderCircle,
} from "lucide-react";
import "./style.css";
import { WindowBar, ModelPaths, Updates } from "./StudioExtras";
import Setup from "./Setup";
import { version } from "../package.json";

type Settings = {
  comfyDirectory: string;
  modelsDirectory: string;
  reserveVram: number;
  preview: string;
  attention: string;
  disableDynamicVram: boolean;
  listenLan: boolean;
  port: number;
  autoStart: boolean;
  startWithWindows: boolean;
  closeToTray: boolean;
  reducedMotion: boolean;
  checkUpdates: boolean;
  onboardingStep: number;
  onboardingDone: boolean;
  modelPaths: Record<string, string[]>;
};
type Status = {
  engine: boolean;
  bridge: boolean;
  ready: boolean;
  busy: boolean;
  phase: string;
  message: string;
  paired: boolean;
  queue: number | null;
  urls: { kind: string; url: string }[];
  stats?: {
    devices?: { name: string; vram_total: number; vram_free: number }[];
    system?: { ram_total: number; ram_free: number };
  };
};
const pages = [
  { id: "engine", label: "Moteur", icon: Sparkles },
  { id: "connection", label: "Connexion", icon: Smartphone },
  { id: "settings", label: "Paramètres", icon: SlidersHorizontal },
  { id: "logs", label: "Journaux", icon: ScrollText },
] as const;
const empty: Status = {
  engine: false,
  bridge: false,
  ready: false,
  busy: false,
  phase: "",
  message: "",
  paired: false,
  queue: null,
  urls: [],
};
const gib = (n?: number) =>
  n == null
    ? "—"
    : `${(n / 1073741824).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
const isPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has("design");
const invoke = <T,>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> =>
  isPreview
    ? Promise.resolve(
        (name === "get_settings"
          ? previewSettings
          : name === "get_status"
            ? previewStatus
            : name === "get_logs"
              ? "Mochi Studio · Services disponibles."
              : undefined) as T,
      )
    : nativeInvoke<T>(name, args);
function Toggle({
  checked,
  onChange,
  disabled,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  title: string;
  description: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function App() {
  const [page, setPage] = useState<string>(
      isPreview
        ? new URLSearchParams(location.search).get("page") || "engine"
        : "engine",
    ),
    [status, setStatus] = useState<Status>(empty),
    [settings, setSettings] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
      null,
    ),
    [logs, setLogs] = useState(""),
    [source, setSource] = useState("studio"),
    [dirty, setDirty] = useState(false),
    [confirmStop, setConfirmStop] = useState(false);
  const [setup, setSetup] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const mounted = useRef(true),
    polling = useRef(false);
  useEffect(() => {
    if (!confirmStop) return;
    const previous = document.activeElement as HTMLElement | null;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmStop(false);
        return;
      }
      if (e.key !== "Tab") return;
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
      );
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [confirmStop]);
  async function refresh() {
    if (polling.current) return;
    polling.current = true;
    try {
      const s = await invoke<Status>("get_status");
      if (mounted.current) {
        setStatus(s);
        setLoaded(true);
      }
    } catch (e) {
      if (mounted.current) setNotice({ error: true, text: String(e) });
    } finally {
      polling.current = false;
    }
  }
  useEffect(() => {
    mounted.current = true;
    invoke<Settings>("get_settings")
      .then((s) => {
        setSettings(s);
        setSetup(!isPreview && !s.onboardingDone);
      })
      .catch((e) => setNotice({ error: true, text: String(e) }));
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const id = setTimeout(() => setNotice(null), 6500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (page !== "logs") return;
    let active = true;
    const load = () =>
      invoke<string>("get_logs", { source })
        .then((v) => {
          if (active) setLogs(v);
        })
        .catch((e) => {
          if (active) setLogs(String(e));
        });
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [source, page]);
  useEffect(() => {
    document.documentElement.classList.toggle(
      "reduced-motion",
      !!settings?.reducedMotion,
    );
  }, [settings?.reducedMotion]);
  async function setupStep(step: number, done = false) {
    try {
      await invoke("onboarding_progress", { step, done });
      setSettings((s) =>
        s ? { ...s, onboardingStep: step, onboardingDone: done } : s,
      );
      if (done) setSetup(false);
    } catch (e) {
      setNotice({ error: true, text: String(e) });
    }
  }
  const working = busy || status.busy;
  async function run(action: "start" | "stop") {
    setConfirmStop(false);
    setBusy(true);
    setNotice(null);
    try {
      await invoke("engine_control", { action });
      setNotice({
        error: false,
        text:
          action === "start"
            ? "Le studio est prêt. Vous pouvez vous connecter depuis Mochi."
            : "Le moteur est arrêté.",
      });
    } catch (e) {
      setNotice({ error: true, text: String(e) });
    } finally {
      setBusy(false);
      await refresh();
    }
  }
  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      await invoke("save_settings", { settings });
      setDirty(false);
      setNotice({
        error: false,
        text: "Paramètres enregistrés. Les réglages du moteur s’appliqueront au prochain démarrage.",
      });
      return true;
    } catch (e) {
      setNotice({ error: true, text: String(e) });
    } finally {
      setBusy(false);
    }
  }
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
    setDirty(true);
  }
  async function folder(key: "comfyDirectory" | "modelsDirectory") {
    try {
      const p = await invoke<string | null>("choose_directory");
      if (p) change(key, p);
    } catch (e) {
      setNotice({ error: true, text: String(e) });
    }
  }
  async function exportPair(kind: string) {
    try {
      if (await invoke<boolean>("export_pairing", { kind }))
        setNotice({
          error: false,
          text: "Appairage exporté. Importez ce fichier dans Mochi et gardez-le privé.",
        });
    } catch (e) {
      setNotice({ error: true, text: String(e) });
    }
  }
  const device = status.stats?.devices?.[0];
  const title = working
    ? "Mochi se prépare…"
    : status.ready
      ? "Mochi est réveillé."
      : status.engine || status.bridge
        ? "Un service manque."
        : "Réveillez votre créativité.";
  return (
    <div className="app">
      <WindowBar />
      <aside>
        <div className="brand">
          <img src="/mochi.webp" alt="" />
          mochi<span>.</span>
        </div>
        <div className="edition">STUDIO PC</div>
        <nav aria-label="Navigation principale">
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              onClick={() => {
                setPage(p.id);
                setSetup(false);
              }}
              aria-current={page === p.id ? "page" : undefined}
            >
              <p.icon size={20} />
              {p.label}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <img src="/mochi.webp" alt="" />
          <strong>Votre PC fait la magie.</strong>
          <small>Mochi l’emporte partout.</small>
          <span className="version">Mochi Studio · {version}</span>
        </div>
      </aside>
      <main>
        {setup && settings ? (
          <Setup
            step={settings.onboardingStep}
            onStep={(step) => void setupStep(step)}
            onLater={() => setSetup(false)}
          >
            {settings.onboardingStep === 0 && (
              <>
                <h2>Votre PC crée. Mochi vous accompagne.</h2>
                <p>
                  Configurez ComfyUI, retrouvez vos modèles puis connectez votre
                  téléphone. Les images sont générées sur votre ordinateur.
                </p>
                <p>
                  Votre installation, vos modèles et votre appairage existants
                  sont conservés.
                </p>
                <button className="primary" onClick={() => void setupStep(1)}>
                  Configurer mon studio
                </button>
              </>
            )}
            {settings.onboardingStep === 1 && (
              <>
                <p>
                  Sélectionnez une installation ComfyUI contenant main.py et
                  venv/Scripts/python.exe, ainsi que votre bibliothèque. ComfyUI
                  doit déjà être installé.
                </p>
                {(
                  [
                    { key: "comfyDirectory", label: "Installation ComfyUI" },
                    {
                      key: "modelsDirectory",
                      label: "Bibliothèque de modèles",
                    },
                  ] as const
                ).map((f) => (
                  <label className="field" key={f.key}>
                    {f.label}
                    <div className="path-field">
                      <input
                        value={settings[f.key]}
                        onChange={(e) => change(f.key, e.target.value)}
                      />
                      <button
                        aria-label={`Parcourir ${f.label}`}
                        onClick={() => void folder(f.key)}
                      >
                        Parcourir
                      </button>
                    </div>
                  </label>
                ))}
                <ModelPaths
                  value={settings.modelPaths || {}}
                  onChange={(v) => change("modelPaths", v)}
                  disabled={working}
                  onError={(e) => setNotice({ error: true, text: String(e) })}
                />
                <button
                  className="primary"
                  disabled={working}
                  onClick={async () => {
                    if (await save()) void setupStep(2);
                  }}
                >
                  Valider les dossiers
                </button>
              </>
            )}
            {settings.onboardingStep === 2 && (
              <>
                <Toggle
                  checked={settings.startWithWindows}
                  title="Ouvrir Mochi avec Windows"
                  description="Le lanceur reste discret dans la zone de notification."
                  disabled={working}
                  onChange={(v) => change("startWithWindows", v)}
                />
                <Toggle
                  checked={settings.autoStart}
                  title="Démarrer le moteur automatiquement"
                  description="À chaque ouverture du lanceur."
                  disabled={working}
                  onChange={(v) => change("autoStart", v)}
                />
                <Toggle
                  checked={settings.listenLan}
                  title="Connexion depuis le téléphone"
                  description="Autoriser le réseau local, avec chiffrement et appairage."
                  disabled={working}
                  onChange={(v) => change("listenLan", v)}
                />
                <Toggle
                  checked={settings.reducedMotion}
                  title="Réduire les animations"
                  description="Une interface plus calme."
                  disabled={working}
                  onChange={(v) => change("reducedMotion", v)}
                />
                <button
                  className="primary"
                  disabled={working}
                  onClick={async () => {
                    if (await save()) void setupStep(3);
                  }}
                >
                  Enregistrer et continuer
                </button>
              </>
            )}
            {settings.onboardingStep === 3 && (
              <>
                <h2>Un même Wi-Fi pour commencer</h2>
                <p>
                  Démarrez le moteur, autorisez le pare-feu puis exportez
                  l’appairage local. Dans Mochi Android, ouvrez Paramètres →
                  Ajouter → Importer un appairage.
                </p>
                <div className="actions">
                  <button
                    disabled={working || status.ready}
                    onClick={() => void run("start")}
                  >
                    {status.ready ? "Services prêts" : "Démarrer le moteur"}
                  </button>
                  <button
                    disabled={working}
                    onClick={() =>
                      invoke("configure_firewall").catch((e) =>
                        setNotice({ error: true, text: String(e) }),
                      )
                    }
                  >
                    Autoriser le pare-feu
                  </button>
                  <button
                    disabled={!status.ready}
                    onClick={() => void exportPair("locale")}
                  >
                    Exporter l’appairage local
                  </button>
                </div>
                <p className="muted">
                  Gardez le fichier d’appairage privé. À distance, utilisez une
                  connexion publique configurée sur votre routeur.
                </p>
                <button
                  className="primary"
                  disabled={!status.ready || working}
                  onClick={() => void setupStep(4)}
                >
                  Les services sont prêts
                </button>
              </>
            )}
            {settings.onboardingStep === 4 && (
              <>
                <h2>Tout part de votre atelier.</h2>
                <p>
                  Sur le téléphone, choisissez un modèle, décrivez votre image
                  et lancez la génération. La galerie conserve vos créations.
                  Les presets mémorisent vos réglages.
                </p>
                <p>
                  Gardez le PC allumé pendant vos générations. Fermer le lanceur
                  ne coupe pas le moteur. Les journaux restent accessibles ici.
                </p>
                <button
                  className="primary"
                  onClick={() => void setupStep(4, true)}
                >
                  Ouvrir mon studio
                </button>
              </>
            )}
            {notice && <p role="alert">{notice.text}</p>}
          </Setup>
        ) : (
          <>
            {settings && !settings.onboardingDone && (
              <button className="setup-resume" onClick={() => setSetup(true)}>
                Reprendre la configuration
              </button>
            )}
            {updateAvailable && page !== "settings" && (
              <button onClick={() => setPage("settings")}>
                Une mise à jour est disponible
              </button>
            )}
            <header>
              <div>
                <div className="eyebrow">VOTRE ESPACE DE CRÉATION</div>
                <h1>
                  {page === "engine"
                    ? "Votre studio, prêt à créer."
                    : pages.find((p) => p.id === page)?.label}
                </h1>
              </div>
              <span className={`badge ${status.ready ? "good" : ""}`}>
                <i />
                {!loaded
                  ? "Vérification…"
                  : working
                    ? "En cours"
                    : status.ready
                      ? "Connecté"
                      : "Hors ligne"}
              </span>
            </header>
            {notice && (
              <div
                className={`notice ${notice.error ? "error" : ""}`}
                role={notice.error ? "alert" : "status"}
              >
                <span>
                  {notice.error ? (
                    <CircleAlert size={18} />
                  ) : (
                    <Check size={18} />
                  )}{" "}
                  {notice.text}
                </span>
                <button
                  aria-label="Fermer le message"
                  onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
            )}
            {page === "engine" && (
              <>
                <section className={`hero ${working ? "working" : ""}`}>
                  <div>
                    <div className="eyebrow">LE MOTEUR DE VOS IMAGES</div>
                    <h2>{title}</h2>
                    <p>
                      {working
                        ? "ComfyUI peut prendre quelques instants à se réveiller."
                        : status.ready
                          ? "Votre téléphone peut rejoindre le studio."
                          : "Lancez ComfyUI et sa connexion sécurisée en un geste."}
                    </p>
                    <div className="actions">
                      <button
                        className="primary"
                        disabled={working || !loaded || dirty}
                        onClick={() =>
                          status.ready
                            ? setConfirmStop(true)
                            : void run("start")
                        }
                      >
                        {working ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : status.ready ? (
                          <Square size={17} />
                        ) : (
                          <Play size={18} />
                        )}{" "}
                        {working
                          ? "Veuillez patienter"
                          : status.ready
                            ? "Arrêter le moteur"
                            : "Démarrer le moteur"}
                      </button>
                      {!status.ready && (status.engine || status.bridge) && (
                        <button
                          disabled={working}
                          onClick={() => setConfirmStop(true)}
                        >
                          <Square size={16} />
                          Arrêter
                        </button>
                      )}
                    </div>
                    {dirty && (
                      <small>
                        Enregistrez vos paramètres avant de démarrer.
                      </small>
                    )}
                  </div>
                  <img
                    className="hero-mochi"
                    src="/mochi.webp"
                    alt="Mochi, votre compagnon créatif"
                  />
                </section>
                <div className="metrics">
                  <div>
                    <small>CARTE GRAPHIQUE</small>
                    <strong>
                      {device?.name
                        ?.replace(/^cuda:\d+\s*/, "")
                        .replace(/\s*:\s*cudaMallocAsync.*/, "") ||
                        "Moteur à l’arrêt"}
                    </strong>
                  </div>
                  <div>
                    <small>VRAM LIBRE</small>
                    <strong>
                      {gib(device?.vram_free)}
                      <span> / {gib(device?.vram_total)}</span>
                    </strong>
                  </div>
                  <div>
                    <small>FILE D’ATTENTE</small>
                    <strong>
                      {status.queue == null
                        ? "—"
                        : status.queue === 0
                          ? "Aucune image"
                          : `${status.queue} image(s)`}
                    </strong>
                  </div>
                </div>
                <section className="services">
                  <div className="section-heading">
                    <h2>Tout à sa place</h2>
                    <button
                      className="text"
                      onClick={() => void refresh()}
                      disabled={working}
                    >
                      <RefreshCw size={15} /> Vérifier
                    </button>
                  </div>
                  {[
                    {
                      title: "ComfyUI",
                      sub: "Moteur d’inférence · 127.0.0.1:8188",
                      ready: status.engine,
                      icon: Cpu,
                    },
                    {
                      title: "Compagnon sécurisé",
                      sub: `Connexion à Mochi · HTTPS :${settings?.port || 8189}`,
                      ready: status.bridge,
                      icon: ShieldCheck,
                    },
                  ].map((s) => (
                    <div className="service" key={s.title}>
                      <span className="service-icon">
                        <s.icon size={21} />
                      </span>
                      <div>
                        <strong>{s.title}</strong>
                        <small>{s.sub}</small>
                      </div>
                      <span
                        className={`service-state ${s.ready ? "good" : ""}`}
                      >
                        <i />
                        {!loaded
                          ? "Vérification"
                          : s.ready
                            ? "Disponible"
                            : "Indisponible"}
                      </span>
                    </div>
                  ))}
                </section>
                {(status.phase || status.message) && !status.ready && (
                  <p className="diagnostic">
                    {status.phase || status.message}{" "}
                    <button className="text" onClick={() => setPage("logs")}>
                      Voir les journaux <ArrowUpRight size={15} />
                    </button>
                  </p>
                )}
                <footer>
                  <ShieldCheck size={17} />
                  Fermer la fenêtre conserve le moteur en arrière-plan.
                </footer>
              </>
            )}
            {page === "connection" && (
              <>
                <p className="intro">
                  Le lien entre votre ordinateur et Mochi. Votre appairage reste
                  conservé entre les démarrages.
                </p>
                <section className="services">
                  <h2>Rejoindre le studio</h2>
                  {status.urls.length ? (
                    status.urls.map((u) => (
                      <div className="connection" key={u.kind}>
                        <div>
                          <span className="eyebrow">
                            CONNEXION {u.kind.toUpperCase()}
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
                            title="Copier l’adresse"
                            aria-label={`Copier l’adresse ${u.kind}`}
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(u.url)
                                .then(() =>
                                  setNotice({
                                    error: false,
                                    text: "Adresse copiée.",
                                  }),
                                )
                                .catch(() =>
                                  setNotice({
                                    error: true,
                                    text: "Copie indisponible.",
                                  }),
                                )
                            }
                          >
                            <Copy size={18} />
                          </button>
                          <button onClick={() => void exportPair(u.kind)}>
                            <Download size={17} /> Appairage
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>
                      Aucun appairage trouvé dans la configuration de ce PC.
                    </p>
                  )}
                </section>
                <div className="tip">
                  <ShieldCheck />
                  <div>
                    <strong>Un appairage qui dure.</strong>
                    <p>
                      Importez le fichier dans les paramètres de Mochi. Il
                      contient votre clé privée de connexion : conservez-le pour
                      vous. Le lanceur ne renouvelle pas votre certificat.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    invoke("open_folder").catch((e) =>
                      setNotice({ error: true, text: String(e) }),
                    )
                  }
                >
                  <FolderOpen size={18} />
                  Ouvrir le dossier de configuration
                </button>
                <button
                  className="firewall"
                  disabled={working}
                  onClick={() => {
                    setBusy(true);
                    invoke("configure_firewall")
                      .then(() =>
                        setNotice({
                          error: false,
                          text: "Le compagnon est autorisé dans le pare-feu Windows.",
                        }),
                      )
                      .catch((e) => setNotice({ error: true, text: String(e) }))
                      .finally(() => setBusy(false));
                  }}
                >
                  <ShieldCheck size={18} />
                  Autoriser le réseau dans Windows
                </button>
                <p className="muted">
                  Cette action demande l’autorisation administrateur de Windows,
                  uniquement pour le port du compagnon.
                </p>
                <p className="muted">
                  L’état « Connecté » confirme le moteur et le compagnon depuis
                  ce PC. L’accès du téléphone dépend aussi du Wi-Fi, du pare-feu
                  et du routeur.
                </p>
              </>
            )}
            {page === "settings" && settings && (
              <>
                <div className="section-heading">
                  <p className="intro">Votre installation, à votre rythme.</p>
                  <button
                    className="primary"
                    onClick={() => void save()}
                    disabled={!dirty || working}
                  >
                    <Check size={18} />
                    Enregistrer
                  </button>
                </div>
                <section className="settings-section">
                  <h2>Dossiers</h2>
                  {(
                    [
                      { key: "comfyDirectory", label: "Installation ComfyUI" },
                      {
                        key: "modelsDirectory",
                        label: "Bibliothèque de modèles",
                      },
                    ] as const
                  ).map((f) => (
                    <label className="field" key={f.key}>
                      {f.label}
                      <div className="path-field">
                        <input
                          value={settings[f.key]}
                          onChange={(e) => change(f.key, e.target.value)}
                          disabled={working}
                        />
                        <button
                          aria-label={`Parcourir ${f.label}`}
                          onClick={() => void folder(f.key)}
                          disabled={working}
                        >
                          <FolderOpen size={19} />
                        </button>
                      </div>
                    </label>
                  ))}
                </section>
                <ModelPaths
                  value={settings.modelPaths || {}}
                  onChange={(v) => change("modelPaths", v)}
                  disabled={working}
                  onError={(e) => setNotice({ error: true, text: String(e) })}
                />
                <section className="settings-section">
                  <h2>Inférence</h2>
                  <div className="form-grid">
                    <label className="field">
                      Réserve VRAM (Go)
                      <input
                        type="number"
                        min="0"
                        max="32"
                        step="0.1"
                        value={settings.reserveVram}
                        onChange={(e) =>
                          change("reserveVram", e.target.valueAsNumber)
                        }
                        disabled={working}
                      />
                      <small>0,9 Go est le profil actuel de votre PC.</small>
                    </label>
                    <label className="field">
                      Aperçu pendant la génération
                      <select
                        value={settings.preview}
                        onChange={(e) => change("preview", e.target.value)}
                        disabled={working}
                      >
                        <option value="auto">Automatique</option>
                        <option value="none">Désactivé</option>
                        <option value="latent2rgb">Léger · Latent RGB</option>
                        <option value="taesd">TAESD</option>
                      </select>
                    </label>
                    <label className="field">
                      Méthode d’attention
                      <select
                        value={settings.attention}
                        onChange={(e) => change("attention", e.target.value)}
                        disabled={working}
                      >
                        <option value="pytorch">PyTorch · profil actuel</option>
                        <option value="auto">Automatique ComfyUI</option>
                      </select>
                    </label>
                  </div>
                  <Toggle
                    checked={settings.disableDynamicVram}
                    onChange={(v) => change("disableDynamicVram", v)}
                    disabled={working}
                    title="Gestion VRAM classique"
                    description="Désactive la VRAM dynamique si votre version de ComfyUI le permet."
                  />
                </section>
                <section className="settings-section">
                  <h2>Réseau</h2>
                  <Toggle
                    checked={settings.listenLan}
                    onChange={(v) => change("listenLan", v)}
                    disabled={working}
                    title="Autoriser la connexion du téléphone"
                    description="Écoute sur le réseau local. La connexion reste authentifiée et chiffrée."
                  />
                  <label className="field short">
                    Port du compagnon
                    <input
                      type="number"
                      min="1024"
                      max="65535"
                      value={settings.port}
                      onChange={(e) => change("port", Number(e.target.value))}
                      disabled={working}
                    />
                  </label>
                  <p className="muted">
                    Après un changement de port, réimportez l’appairage et
                    adaptez la redirection du routeur. Arrêtez le moteur avant
                    d’appliquer les réglages réseau.
                  </p>
                </section>
                <section className="settings-section">
                  <h2>Au quotidien</h2>
                  <Toggle
                    checked={settings.closeToTray}
                    onChange={(v) => change("closeToTray", v)}
                    disabled={working}
                    title="Fermer dans la zone de notification"
                    description="Conserver le lanceur accessible près de l’horloge."
                  />
                  <Toggle
                    checked={settings.reducedMotion}
                    onChange={(v) => change("reducedMotion", v)}
                    disabled={working}
                    title="Réduire les animations"
                    description="Limiter les mouvements de l’interface."
                  />
                  <Toggle
                    checked={settings.checkUpdates}
                    onChange={(v) => change("checkUpdates", v)}
                    disabled={working}
                    title="Vérifier les mises à jour à l’ouverture"
                    description="L’installation reste à votre initiative."
                  />
                  <button
                    onClick={() => {
                      void setupStep(0);
                      setSetup(true);
                    }}
                  >
                    Refaire la configuration
                  </button>
                  <Toggle
                    checked={settings.startWithWindows}
                    onChange={(v) => change("startWithWindows", v)}
                    disabled={working}
                    title="Ouvrir le lanceur avec Windows"
                    description="Mochi Studio reste discret dans la zone de notification."
                  />
                  <Toggle
                    checked={settings.autoStart}
                    onChange={(v) => change("autoStart", v)}
                    disabled={working}
                    title="Démarrer le moteur à l’ouverture"
                    description="Lance ComfyUI et vérifie la connexion automatiquement."
                  />
                </section>
                <p className="muted">
                  Les réglages d’inférence s’appliquent après un arrêt puis un
                  démarrage. Aucun changement du nombre de pas, du modèle ou de
                  la précision des images.
                </p>
              </>
            )}
            {page === "logs" && (
              <>
                <div className="section-heading">
                  <p className="intro">
                    Comprendre ce qui se passe, sans ouvrir de terminal.
                  </p>
                  <button
                    onClick={() =>
                      invoke("open_folder").catch((e) =>
                        setNotice({ error: true, text: String(e) }),
                      )
                    }
                  >
                    <FolderOpen size={18} />
                    Dossier
                  </button>
                </div>
                <div className="tabs" role="tablist" aria-label="Journaux">
                  {[
                    ["studio", "Lanceur"],
                    ["comfy", "ComfyUI"],
                    ["bridge", "Compagnon"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={source === id}
                      onClick={() => setSource(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <pre
                  className="logs"
                  tabIndex={0}
                  aria-label={`Journal ${source}`}
                >
                  {logs || "Aucune entrée pour le moment."}
                </pre>
                <small className="muted">
                  Actualisation toutes les 2,5 secondes · dernières 48 Ko de
                  chaque journal.
                </small>
              </>
            )}
          </>
        )}
        <div hidden={setup || page !== "settings"}>
          <Updates
            automatic={!!settings?.checkUpdates}
            disabled={working}
            onAvailable={setUpdateAvailable}
          />
        </div>
      </main>
      {confirmStop && (
        <div className="overlay" onClick={() => setConfirmStop(false)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-title"
            onClick={(e) => e.stopPropagation()}
          >
            <img src="/mochi.webp" alt="" />
            <h2 id="stop-title">Mettre Mochi au repos ?</h2>
            <p>
              Le téléphone ne pourra plus générer d’images tant que le moteur
              sera arrêté. Une génération en cours ou en attente empêchera
              l’arrêt.
            </p>
            <div className="actions">
              <button autoFocus onClick={() => setConfirmStop(false)}>
                Garder le moteur
              </button>
              <button className="primary" onClick={() => void run("stop")}>
                Arrêter
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
