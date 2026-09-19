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
} from "lucide-react";
import { native, parsePairing, type Pairing } from "./api";
import { LockSettings } from "./AppLock";

export interface ProfileInfo {
  id: string;
  name: string;
  url: string;
  active: boolean;
}
type Props = {
  server: string;
  busy: boolean;
  active: boolean;
  onConnect: (id: string) => Promise<void>;
  onDisconnect: (alreadyDisconnected?: boolean) => Promise<void>;
  onError: (error: string) => void;
};
const blank: Pairing = { url: "", token: "", certificate: "" };

export default function Connections({
  server,
  busy,
  active,
  onConnect,
  onDisconnect,
  onError,
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
    if (!name) setName("Mon PC");
  };
  const save = (connect: boolean) =>
    run(async () => {
      const next = raw.trim()
        ? parsePairing(raw)
        : parsePairing(JSON.stringify(pairing));
      const wasActive = profiles.some((p) => p.id === editing && p.active);
      const id = await native<string>("save_profile", {
        id: editing,
        name: name.trim() || "Mon PC",
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
      <LockSettings />
      <section className="panel" aria-busy={loading || working}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">VOS ORDINATEURS</span>
            <h2>Connexions</h2>
          </div>
          <button
            aria-label="Ajouter une connexion"
            disabled={disabled || loading}
            onClick={() => reset(true)}
          >
            <Plus />
          </button>
        </div>
        <p className="muted">
          Un profil pour chaque PC, ou pour ses adresses Wi-Fi et WireGuard.
        </p>
        {loading && (
          <p className="hint" role="status">
            Chargement des connexions…
          </p>
        )}
        {!loading && !profiles.length && !error && (
          <p className="hint">
            Importez l’appairage de votre PC pour commencer.
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
                  <small>{profile.url}</small>
                </span>
                {profile.active && (
                  <Check size={19} aria-label="Connexion active" />
                )}
              </div>
              <div className="row">
                <button
                  className={profile.active ? "" : "primary"}
                  disabled={disabled}
                  onClick={() => void connect(profile.id)}
                >
                  <Link size={16} />
                  {profile.active ? "Reconnecter" : "Connecter"}
                </button>
                <button
                  aria-label={`Modifier ${profile.name}`}
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
                  aria-label={`Supprimer le profil ${profile.name}`}
                  disabled={disabled}
                  onClick={() =>
                    void run(async () => {
                      if (
                        !confirm(
                          `Supprimer le profil « ${profile.name} » de cet appareil ?`,
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
            <Unplug size={17} /> Déconnecter
          </button>
        )}
        {error && !form && <p role="alert">{error}</p>}
      </section>
      {form && (
        <section ref={formRef} className="panel connection-form">
          <div className="section-heading">
            <h2>{editing ? "Modifier la connexion" : "Ajouter un PC"}</h2>
            {profiles.length > 0 && (
              <button disabled={disabled} onClick={() => reset(false)}>
                Fermer
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
                Nom de la connexion
                <input
                  value={name}
                  maxLength={80}
                  placeholder="PC maison · Wi-Fi"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="file-picker">
                <FolderOpen size={19} /> Importer un fichier d’appairage
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void run(async () => {
                        if (file.size > 100_000)
                          throw new Error(
                            "Fichier d’appairage trop volumineux.",
                          );
                        fill(await file.text());
                      });
                    e.target.value = "";
                  }}
                />
              </label>
              <details>
                <summary>Coller un fichier d’appairage</summary>
                <label>
                  Ou collez son contenu
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
                  Lire l’appairage
                </button>
              </details>
              <label>
                Adresse du PC
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
                Clé d’accès
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
                <summary>Certificat du PC</summary>
                <label>
                  Certificat PEM
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
                <ShieldCheck size={16} /> L’adresse doit être couverte par le
                certificat du PC. Le tunnel WireGuard reste géré par votre
                application VPN.
              </p>
              {error && <p role="alert">{error}</p>}
              <div className="row">
                <button type="button" onClick={() => void save(false)}>
                  Enregistrer
                </button>
                <button type="submit" className="primary">
                  <Link size={17} />
                  {working
                    ? "Connexion…"
                    : editing
                      ? "Enregistrer et connecter"
                      : "Connecter mon PC"}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      )}
    </div>
  );
}
