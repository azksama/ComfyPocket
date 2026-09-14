import { useEffect, useState } from "react";
import { Cpu, MemoryStick, RefreshCw } from "lucide-react";
import { api, type Stats } from "./api";
import { Modal } from "./components";
const memory = (value?: number) => typeof value === "number" && Number.isFinite(value) ? `${(value / 1024 ** 3).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go` : "Indisponible";
export default function ConnectionStatus({ server, initial, onClose, onSettings }: { server: string; initial: Stats | null; onClose: () => void; onSettings: () => void }) {
  const [stats, setStats] = useState(initial), [state, setState] = useState("Vérification…"), [updated, setUpdated] = useState("");
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { const data = await api<Stats>("/api/system_stats"); if (live) { setStats(data); setState("Connecté"); setUpdated(new Date().toLocaleTimeString("fr-FR")); } }
      catch { if (live) { setState("PC indisponible"); setStats(null); } }
      finally { if (live) timer = setTimeout(refresh, 4000); }
    };
    if (server) void refresh(); else setState("Non connecté");
    return () => { live = false; clearTimeout(timer); };
  }, [server]);
  const address = server ? new URL(server) : null;
  return <Modal title="État du PC" onClose={onClose} className="connection-status"><span className="connection-state" role="status"><span className={`dot ${state === "Connecté" ? "online" : ""}`} />{state}</span><dl className="connection-details"><div><dt>Adresse IP / hôte</dt><dd>{address?.hostname ?? "Aucun PC"}</dd></div><div><dt>Port HTTPS</dt><dd>{address ? address.port || "443" : "—"}</dd></div></dl>
    {stats?.devices.map((gpu, i) => <section className="resource-stat" key={i}><h3><Cpu size={19} />{gpu.name.replace(/^cuda:\d+\s*/, "").replace(/\s*:\s*cudaMallocAsync.*$/, "")}</h3><p>VRAM disponible <strong>{memory(gpu.vram_free)}</strong><span>sur {memory(gpu.vram_total)}</span></p>{gpu.vram_total > 0 && <meter min={0} max={gpu.vram_total} value={gpu.vram_free} aria-label={`VRAM disponible GPU ${i + 1}`} />}</section>)}
    <section className="resource-stat"><h3><MemoryStick size={19} />Mémoire du PC</h3><p>RAM disponible <strong>{memory(stats?.system?.ram_free)}</strong><span>sur {memory(stats?.system?.ram_total)}</span></p>{!!stats?.system?.ram_total && <meter min={0} max={stats.system.ram_total} value={stats.system.ram_free ?? 0} aria-label="RAM disponible" />}</section>
    <p className="hint">{updated && state === "Connecté" ? `Actualisé à ${updated}` : "Les ressources sont lues directement sur le PC."}</p><button onClick={onSettings}><RefreshCw size={17} /> Gérer les connexions</button></Modal>;
}
