import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
} from "react";
import { api, imagePath, type Queue, type History, type Event } from "./api";
import { getClientId, writeStored } from "./sessionStorage";
import { mapConcurrent, pollingDelay } from "./asyncPool";
import type { ViewItem } from "./viewTypes";

export const clientId = getClientId();
export function useGenerationSession(
  server: string,
  epoch: number,
  generation: RefObject<number>,
  onOnline: (value: boolean) => void,
  onError: (value: string) => void,
) {
  const [queue, setQueue] = useState<Queue>({
    queue_running: [],
    queue_pending: [],
  });
  const [jobs, setJobs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("Prêt à créer");
  const [preview, setPreview] = useState("");
  const [results, setResults] = useState<ViewItem[]>([]);
  const jobsRef = useRef<string[]>([]),
    cursor = useRef(0),
    missing = useRef(new Map<string, number>());
  const wakeRef = useRef<() => void>(() => {});
  const track = useCallback((ids: string[], url: string) => {
    const start = !jobsRef.current.length && ids.length > 0;
    jobsRef.current = ids;
    setJobs(ids);
    if (url) writeStored("tasks:" + url, ids);
    if (start) wakeRef.current();
  }, []);
  useEffect(() => {
    if (!server) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const version = generation.current;
    const valid = () => !stopped && version === generation.current;
    let polling = false;
    async function poll() {
      if (polling || !valid()) return;
      polling = true;
      const polled = [...jobsRef.current];
      try {
        const [q, events] = await Promise.all([
          api<Queue>("/api/queue"),
          api<{ events: Event[]; seq: number; connected: boolean }>(
            `/bridge/events?clientId=${clientId}&after=${cursor.current}`,
          ),
        ]);
        if (!valid()) return;
        setQueue(q);
        onOnline(true);
        cursor.current = events.seq;
        for (const e of events.events) {
          const d = typeof e.data === "string" ? null : e.data;
          if (
            e.type === "preview" &&
            jobsRef.current.length &&
            typeof e.data === "string"
          )
            setPreview(e.data);
          if (d?.prompt_id && !jobsRef.current.includes(String(d.prompt_id)))
            continue;
          if (e.type === "progress" && d && jobsRef.current.length) {
            setProgress(Math.round((Number(d.value) / Number(d.max)) * 100));
            setPhase("Génération en cours");
          }
          if (e.type === "executing" && d?.node && jobsRef.current.length)
            setPhase("Votre PC compose l’image");
        }
        const histories = await mapConcurrent(polled, 3, async (id) => {
          if (!valid()) throw new Error("Session terminée");
          return { id, entry: (await api<History>("/api/history/" + id))[id] };
        });
        if (!valid()) return;
        const done = new Set<string>(),
          found: ViewItem[] = [];
        let failed = false;
        for (const { id, entry } of histories) {
          if (
            entry?.status?.completed ||
            entry?.status?.status_str === "error"
          ) {
            done.add(id);
            found.push(
              ...Object.values(entry.outputs ?? {}).flatMap((o) =>
                (o.images ?? [])
                  .filter((i) => i.type === "output")
                  .map((i) => ({ path: imagePath(i), name: i.filename })),
              ),
            );
            if (entry.status.status_str === "error") {
              failed = true;
              onError(
                String(
                  entry.status.messages?.find(
                    (m) => m[0] === "execution_error",
                  )?.[1]?.exception_message ??
                    "Génération interrompue ou échouée.",
                ),
              );
            }
          } else if (
            !q.queue_running.some((j) => j[1] === id) &&
            !q.queue_pending.some((j) => j[1] === id)
          ) {
            const count = (missing.current.get(id) ?? 0) + 1;
            missing.current.set(id, count);
            if (count >= 3) {
              done.add(id);
              failed = true;
              onError(
                "Une tâche a disparu de la file et de l’historique du PC.",
              );
            }
          } else missing.current.delete(id);
        }
        if (done.size) {
          const remaining = jobsRef.current.filter((id) => !done.has(id));
          track(remaining, server);
          if (found.length)
            setResults((old) => {
              const next = [...found, ...old].slice(0, 160);
              writeStored("results:" + server, next);
              return next;
            });
          setPreview("");
          setProgress(remaining.length ? 0 : failed ? 0 : 100);
          setPhase(
            remaining.length
              ? `${remaining.length} lot(s) restant(s)`
              : failed
                ? "Traitement terminé avec une erreur"
                : "Génération terminée",
          );
        }
      } catch {
        if (valid()) {
          onOnline(false);
          if (jobsRef.current.length)
            setPhase("Connexion perdue · reprise automatique");
        }
      } finally {
        polling = false;
        if (!stopped)
          timer = setTimeout(
            poll,
            pollingDelay(jobsRef.current.length > 0, document.hidden),
          );
      }
    }
    const wake = () => {
      clearTimeout(timer);
      void poll();
    };
    wakeRef.current = wake;
    const visible = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", visible);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wakeRef.current = () => {};
      document.removeEventListener("visibilitychange", visible);
    };
  }, [server, epoch, track, generation, onOnline, onError]);
  const reset = () => {
    cursor.current = 0;
    missing.current.clear();
    track([], "");
    setQueue({ queue_running: [], queue_pending: [] });
    setResults([]);
    setPreview("");
    setProgress(0);
    setPhase("Prêt à créer");
  };
  return {
    queue,
    jobs,
    jobsRef,
    track,
    cursor,
    progress,
    setProgress,
    phase,
    setPhase,
    preview,
    setPreview,
    results,
    setResults,
    reset,
  };
}
