import VoiceModels from "./VoiceModels";
import { UpdateSettings } from "./AppUpdater";
import "./settings-hub.css";
import LanguagePicker from "./LanguagePicker";
import { t as tr, locale } from "./i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Monitor,
  Plus,
  Pencil,
  Trash2,
  Link,
  FolderOpen,
  ShieldCheck,
  Unplug,
  Check,
  ChevronRight,
  Layers,
  Workflow,
  Bookmark,
  Palette,
  Download,
} from "lucide-react";
import {
  native,
  parsePairing,
  type Pairing,
  type Stats,
  type Queue,
} from "./api";
import { version } from "../package.json";
import { LockSettings } from "./AppLock";

export interface ProfileInfo {
  id: string;
  name: string;
  url: string;
  active: boolean;
}
type Props = {
  quickMenu: boolean;
  onQuickMenu: (value: boolean) => void;
  leftHanded: boolean;
  onHandedness: (value: boolean) => void;
  server: string;
  busy: boolean;
  active: boolean;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (alreadyDisconnected?: boolean) => Promise<void>;
  onError: (error: string) => void;
  stats: Stats | null;
  queue: Queue;
  online: boolean;
  onOpen: (target: "models" | "workflow" | "presets" | "trash") => void;
};
const blank: Pairing = { url: "", token: "", certificate: "" };

export default function Connections({
  quickMenu,
  onQuickMenu,
  leftHanded,
  onHandedness,
  server,
  busy,
  active,
  onConnect,
  onDisconnect,
  onError,
  stats,
  queue,
  online,
  onOpen,
}: Props) {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<Pairing>(blank);
  const [raw, setRaw] = useState("");
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const operation = useRef(false),
    revision = useRef(0),
    mounted = useRef(true);
  const formRef = useRef<HTMLElement>(null);
  const disabled = busy || working;

  const load = useCallback(async () => {
    const id = ++revision.current;
    const items = await native<ProfileInfo[]>("list_profiles");
    if (!mounted.current || id !== revision.current) return;
    setProfiles(items ?? []);
    setLoading(false);
    if (!items?.length) setForm(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ++revision.current;
    };
  }, []);
  useEffect(() => {
    void load().catch((e) => {
      if (mounted.current) {
        setError(String(e));
        setLoading(false);
      }
    });
  }, [server, load]);
  useEffect(() => {
    if (active && form && profiles.length)
      formRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [form, editing, active]);

  const report = (value: string) => {
    setError(value);
    onError(value);
  };
  const run = async (fn: () => Promise<void>) => {
    if (operation.current || busy) return;
    operation.current = true;
    setWorking(true);
    report("");
    try {
      await fn();
    } catch (e) {
      if (mounted.current) report(String(e));
    } finally {
      operation.current = false;
      if (mounted.current) setWorking(false);
    }
  };
  const reset = (show: boolean) => {
    setEditing(null);
    setName("");
    setPairing(blank);
    setRaw("");
    setForm(show);
    setError("");
  };
  const fill = (text: string) => {
    setPairing(parsePairing(text));
    setRaw("");
    if (!name) setName(tr("Mon PC"));
  };
  const save = (connect: boolean) =>
    run(async () => {
      const next = raw.trim()
        ? parsePairing(raw)
        : parsePairing(JSON.stringify(pairing));
      const wasActive = profiles.some((p) => p.id === editing && p.active);
      const id = await native<string>("save_profile", {
        id: editing,
        name: name.trim() || tr("Mon PC"),
        pairing: next,
      });
      if (wasActive) await onDisconnect(true);
      reset(false);
      await load();
      if (connect) {
        // Saving has succeeded even when the PC is offline; retain the profile for retry.
        try {
          await onConnect(id);
        } finally {
          await load();
        }
      }
    });
  const connect = (id: string) =>
    run(async () => {
      try {
        await onConnect(id);
      } finally {
        await load();
      }
    });

  return (
    <div className="connections">
      <section className="panel" aria-busy={loading || working}>
        <div className="section-heading">
          <div>
            <h2>{tr("Mes ordinateurs")}</h2>
          </div>
          <button
            aria-label={tr("Ajouter une connexion")}
            disabled={disabled || loading}
            onClick={() => reset(true)}
          >
            <Plus size={14} /> {tr("Ajouter")}{" "}
          </button>
        </div>
        <p className="muted">
          {" "}
          {tr(
            "Un profil pour chaque PC, ou pour ses adresses Wi-Fi et WireGuard.",
          )}{" "}
        </p>
        {loading && (
          <p className="hint" role="status">
            {" "}
            {tr("Chargement des connexions…")}{" "}
          </p>
        )}
        {!loading && !profiles.length && !error && (
          <p className="hint">
            {" "}
            {tr("Importez l’appairage de votre PC pour commencer.")}{" "}
          </p>
        )}
        <div className="profile-list">
          {profiles.map((profile) => (
            <article
              className={`profile-card ${profile.active ? "selected" : ""}`}
              key={profile.id}
            >
              <div className="profile-title">
                <span className="icon-tile">
                  <Monitor />
                </span>
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.active
                      ? online
                        ? tr("Connecté · ")
                        : tr("Indisponible · ")
                      : ""}
                    {profile.url}
                  </small>
                </span>
                {profile.active && (
                  <Check size={19} aria-label={tr("Connexion active")} />
                )}
              </div>
              {profile.active && online && (
                <div className="settings-resources">
                  <div>
                    <small>GPU</small>
                    <strong>
                      {stats?.devices[0]?.name.replace(/^.*?NVIDIA /, "") ??
                        "—"}
                    </strong>
                  </div>
                  <div>
                    <small>{tr("VRAM LIBRE")}</small>
                    <strong>
                      {stats?.devices[0]
                        ? tr("{0} Go", [
                            (
                              stats.devices[0].vram_free /
                              1024 ** 3
                            ).toLocaleString(locale(), {
                              maximumFractionDigits: 1,
                            }),
                          ])
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <small>{tr("FILE D’ATTENTE")}</small>
                    <strong>
                      {queue.queue_pending.length} {tr("image(s)")}
                    </strong>
                  </div>
                </div>
              )}
              <div className="row">
                <button
                  className={profile.active ? "" : "primary"}
                  disabled={disabled}
                  onClick={() => void connect(profile.id)}
                >
                  <Link size={16} />
                  {profile.active ? tr("Reconnecter") : tr("Connecter")}
                </button>
                <button
                  aria-label={tr("Modifier {0}", [profile.name])}
                  disabled={disabled}
                  onClick={() =>
                    void run(async () => {
                      const full = await native<{
                        id: string;
                        name: string;
                        pairing: Pairing;
                      }>("get_profile", { id: profile.id });
                      setEditing(full.id);
                      setName(full.name);
                      setPairing(full.pairing);
                      setRaw("");
                      setForm(true);
                    })
                  }
                >
                  <Pencil size={18} />
                </button>
                <button
                  aria-label={tr("Supprimer le profil {0}", [profile.name])}
                  disabled={disabled}
                  onClick={() =>
                    void run(async () => {
                      if (
                        !confirm(
                          tr("Supprimer le profil « {0} » de cet appareil ?", [
                            profile.name,
                          ]),
                        )
                      )
                        return;
                      await native("delete_profile", { id: profile.id });
                      if (profile.active) await onDisconnect(true);
                      if (editing === profile.id) reset(false);
                      await load();
                    })
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {server && (
          <button
            className="wide"
            disabled={disabled}
            onClick={() =>
              void run(async () => {
                await onDisconnect();
                await load();
              })
            }
          >
            <Unplug size={17} /> {tr("Déconnecter")}{" "}
          </button>
        )}
        {error && !form && <p role="alert">{error}</p>}
      </section>
      {form && (
        <section ref={formRef} className="panel connection-form">
          <div className="section-heading">
            <h2>
              {editing ? tr("Modifier la connexion") : tr("Ajouter un PC")}
            </h2>
            {profiles.length > 0 && (
              <button disabled={disabled} onClick={() => reset(false)}>
                {" "}
                {tr("Fermer")}{" "}
              </button>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(true);
            }}
          >
            <fieldset
              disabled={disabled}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <label>
                {" "}
                {tr("Nom de la connexion")}{" "}
                <input
                  value={name}
                  maxLength={80}
                  placeholder={tr("PC maison · Wi-Fi")}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="file-picker">
                <FolderOpen size={19} /> {tr("Importer un fichier d’appairage")}{" "}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        if (file.size > 100_000)
                          throw new Error(
                            tr("Fichier d’appairage trop volumineux."),
                          );
                        fill(await file.text());
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <details>
                <summary>{tr("Coller un fichier d’appairage")}</summary>
                <label>
                  {" "}
                  {tr("Ou collez son contenu")}{" "}
                  <textarea
                    value={raw}
                    maxLength={100_000}
                    rows={4}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(e) => setRaw(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!raw.trim()}
                  onClick={() => {
                    try {
                      fill(raw);
                      setError("");
                    } catch (e) {
                      report(String(e));
                    }
                  }}
                >
                  {" "}
                  {tr("Lire l’appairage")}{" "}
                </button>
              </details>
              <label>
                {" "}
                {tr("Adresse du PC")}{" "}
                <input
                  type="url"
                  value={pairing.url}
                  maxLength={2048}
                  placeholder="https://192.168.1.8:8189"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) =>
                    setPairing((p) => ({ ...p, url: e.target.value }))
                  }
                />
              </label>
              <label>
                {" "}
                {tr("Clé d’accès")}{" "}
                <input
                  type="password"
                  value={pairing.token}
                  maxLength={256}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) =>
                    setPairing((p) => ({ ...p, token: e.target.value }))
                  }
                />
              </label>
              <details>
                <summary>{tr("Certificat du PC")}</summary>
                <label>
                  {" "}
                  {tr("Certificat PEM")}{" "}
                  <textarea
                    value={pairing.certificate}
                    maxLength={65536}
                    rows={6}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(e) =>
                      setPairing((p) => ({ ...p, certificate: e.target.value }))
                    }
                  />
                </label>
              </details>
              <p className="hint">
                <ShieldCheck size={16} />{" "}
                {tr(
                  "L’adresse doit être couverte par le certificat du PC. Le tunnel WireGuard reste géré par votre application VPN.",
                )}{" "}
              </p>
              {error && <p role="alert">{error}</p>}
              <div className="row">
                <button type="button" onClick={() => void save(false)}>
                  {" "}
                  {tr("Enregistrer")}{" "}
                </button>
                <button type="submit" className="primary">
                  <Link size={17} />
                  {working
                    ? tr("Connexion…")
                    : editing
                      ? tr("Enregistrer et connecter")
                      : tr("Connecter mon PC")}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
      <details className="connection-help">
        <summary>{tr("Aide à la connexion")}</summary>
        <div className="connection-tip">
          <strong>{tr("Votre PC reste le moteur.")}</strong>
          {tr(
            "Gardez le compagnon ouvert en arrière-plan. En déplacement, utilisez votre connexion distante ou WireGuard.",
          )}{" "}
        </div>
      </details>
      <details className="settings-group">
        <summary>
          <Layers />
          <span>
            <strong>{tr("Atelier")}</strong>
            <small>{tr("Raccourcis, bibliothèque et génération")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <section className="settings-menu">
            <label className="switch-row handedness-setting">
              <span>
                <strong>{tr("Menu rapide de l’Atelier")}</strong>
                <small>{tr("Accès aux sections et à la génération")}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={tr("Menu rapide de l’Atelier")}
                checked={quickMenu}
                onChange={(e) => onQuickMenu(e.target.checked)}
              />
            </label>
            <label className="switch-row handedness-setting">
              <span>
                <strong>{tr("Mode gaucher")}</strong>
                <small>
                  {tr("Placer les raccourcis de l’Atelier à gauche")}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label={tr("Mode gaucher")}
                checked={leftHanded}
                onChange={(e) => onHandedness(e.target.checked)}
              />
            </label>

            <button disabled={!server} onClick={() => onOpen("models")}>
              <Layers />
              <span>
                <strong>{tr("Modèles, LoRAs & upscalers")}</strong>
                <small>{tr("Retrouver les ressources de votre PC")}</small>
              </span>
              <ChevronRight />
            </button>
            <button disabled={!server} onClick={() => onOpen("workflow")}>
              <Workflow />
              <span>
                <strong>{tr("Workflows ComfyUI")}</strong>
                <small>{tr("Importer et adapter un workflow API")}</small>
              </span>
              <ChevronRight />
            </button>
            <button disabled={!server} onClick={() => onOpen("presets")}>
              <Bookmark />
              <span>
                <strong>{tr("Mes presets")}</strong>
                <small>
                  {tr("Enregistrer et réutiliser une configuration")}
                </small>
              </span>
              <ChevronRight />
            </button>
          </section>
        </div>
      </details>
      <details className="settings-group">
        <summary>
          <Download />
          <span>
            <strong>{tr("Voix et modèles")}</strong>
            <small>{tr("Whisper et assistant Danbooru")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <VoiceModels />
        </div>
      </details>
      <details className="settings-group">
        <summary>
          <ShieldCheck />
          <span>
            <strong>{tr("Sécurité")}</strong>
            <small>{tr("Biométrie et confidentialité")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <LockSettings />
        </div>
      </details>
      <details className="settings-group">
        <summary>
          <Palette />
          <span>
            <strong>{tr("Application")}</strong>
            <small>{tr("Langue, apparence et mises à jour")}</small>
          </span>
          <ChevronRight />
        </summary>
        <div className="settings-group-content">
          <section className="settings-menu">
            <LanguagePicker />
            <div className="setting-row">
              <Palette />
              <span>
                <strong>{tr("Apparence")}</strong>
                <small>{tr("Pastel lavande · Clair")}</small>
              </span>
            </div>
            <button disabled={!server} onClick={() => onOpen("trash")}>
              <Trash2 />
              <span>
                <strong>{tr("Corbeille récupérable")}</strong>
                <small>{tr("Retrouver vos images supprimées")}</small>
              </span>
              <ChevronRight />
            </button>
            <div className="setting-row">
              <Download />
              <span>
                <strong>{tr("Téléchargements")}</strong>
                <small>Pictures / Mochi</small>
              </span>
            </div>
          </section>
          <UpdateSettings />
          <button
            className="setup-mobile-resume"
            onClick={() => window.dispatchEvent(new Event("mochi-setup"))}
          >
            {locale() === "en" ? "Restart setup" : "Refaire la configuration"}
          </button>
        </div>
      </details>
      <div className="settings-version">
        <span>Mochi</span>
        <span>Version {version}</span>
      </div>
    </div>
  );
}
