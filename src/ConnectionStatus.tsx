import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, MemoryStick, RefreshCw, Settings } from "lucide-react";
import { api, type Stats } from "./api";
import { Modal } from "./components";

const memory = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${(value / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`
    : "Indisponible";
function MemoryMeter({
  total,
  free,
  label,
}: {
  total?: number;
  free?: number;
  label: string;
}) {
  if (
    !Number.isFinite(total) ||
    !total ||
    total < 0 ||
    !Number.isFinite(free) ||
    free === undefined ||
    free < 0
  )
    return null;
  return (
    <meter
      min={0}
      max={total}
      value={Math.min(total, free)}
      aria-label={label}
    />
  );
}
function addressOf(server: string) {
  try {
    return new URL(server);
  } catch {
    return null;
  }
}

export default function ConnectionStatus({
  server,
  initial,
  onClose,
  onSettings,
}: {
  server: string;
  initial: Stats | null;
  onClose: () => void;
  onSettings: () => void;
}) {
  const [stats, setStats] = useState(initial);
  const [state, setState] = useState("Vérification…");
  const [updated, setUpdated] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let live = true,
      pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState(server ? "Vérification…" : "Non connecté");
    setStats(null);
    setUpdated("");
    setError("");
    const update = async () => {
      clearTimeout(timer);
      if (!live || !server || document.hidden || pending) return;
      pending = true;
      setBusy(true);
      try {
        const data = await api<Stats>("/api/system_stats");
        if (live) {
          setStats(data);
          setState("Connecté");
          setError("");
          setUpdated(new Date().toLocaleTimeString("fr-FR"));
        }
      } catch (e) {
        if (live) {
          setState("PC indisponible");
          setStats(null);
          setError(String(e));
        }
      } finally {
        pending = false;
        if (live) {
          setBusy(false);
          if (!document.hidden) timer = setTimeout(update, 4000);
        }
      }
    };
    refreshRef.current = () => void update();
    const visibility = () => {
      if (document.hidden) clearTimeout(timer);
      else void update();
    };
    document.addEventListener("visibilitychange", visibility);
    void update();
    return () => {
      live = false;
      clearTimeout(timer);
      refreshRef.current = () => {};
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [server]);

  const address = addressOf(server);
  const devices = Array.isArray(stats?.devices) ? stats.devices : [];
  return (
    <Modal title="État du PC" onClose={onClose} className="connection-status">
      <div className="section-heading">
        <span className="connection-state" role="status">
          <span className={`dot ${state === "Connecté" ? "online" : ""}`} />
          {state}
        </span>
        <button
          aria-label="Actualiser l’état du PC"
          disabled={busy || !server}
          onClick={refresh}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <dl className="connection-details">
        <div>
          <dt>Adresse IP / hôte</dt>
          <dd>{address?.hostname ?? "Aucun PC"}</dd>
        </div>
        <div>
          <dt>Port HTTPS</dt>
          <dd>{address ? address.port || "443" : "—"}</dd>
        </div>
      </dl>
      {devices.map((gpu, index) => (
        <section className="resource-stat" key={index}>
          <h3>
            <Cpu size={19} />
            {gpu.name
              .replace(/^cuda:\d+\s*/, "")
              .replace(/\s*:\s*cudaMallocAsync.*$/, "")}
          </h3>
          <p>
            VRAM disponible <strong>{memory(gpu.vram_free)}</strong>
            <span>sur {memory(gpu.vram_total)}</span>
          </p>
          <MemoryMeter
            total={gpu.vram_total}
            free={gpu.vram_free}
            label={`VRAM disponible GPU ${index + 1}`}
          />
        </section>
      ))}
      <section className="resource-stat">
        <h3>
          <MemoryStick size={19} />
          Mémoire du PC
        </h3>
        <p>
          RAM disponible <strong>{memory(stats?.system?.ram_free)}</strong>
          <span>sur {memory(stats?.system?.ram_total)}</span>
        </p>
        <MemoryMeter
          total={stats?.system?.ram_total}
          free={stats?.system?.ram_free}
          label="RAM disponible"
        />
      </section>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      <p className="hint">
        {updated && state === "Connecté"
          ? `Actualisé à ${updated}`
          : "Les ressources sont lues directement sur le PC."}
      </p>
      <button onClick={onSettings}>
        <Settings size={17} /> Gérer les connexions
      </button>
    </Modal>
  );
}
