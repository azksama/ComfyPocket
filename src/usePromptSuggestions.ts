import { useEffect, useRef, useState } from "react";
import type { Tag } from "./tags";

export function usePromptSuggestions(
  query: string,
  enabled: boolean,
  composing: boolean,
) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    setError("");
    setCount(0);
    if (!enabled) return;
    const unavailable = () => {
      setError("Suggestions indisponibles. La saisie reste disponible.");
      setPending(false);
      setTags([]);
    };
    let instance: Worker;
    try {
      instance = new Worker(new URL("./tags.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      unavailable();
      return;
    }
    worker.current = instance;
    instance.onmessage = (
      event: MessageEvent<{
        ready?: number;
        error?: string;
        id?: number;
        tags?: Tag[];
      }>,
    ) => {
      const data = event.data;
      if (data.ready) setCount(data.ready);
      if (data.error) unavailable();
      if (data.id === sequence.current && data.tags) {
        setTags(data.tags);
        setPending(false);
      }
    };
    instance.onerror = unavailable;
    return () => {
      sequence.current++;
      worker.current = null;
      instance.terminate();
    };
  }, [enabled, attempt]);

  useEffect(() => {
    const id = ++sequence.current;
    if (!enabled || !query || error) {
      setTags([]);
      setPending(false);
      return;
    }
    if (composing) {
      setPending(true);
      return;
    }
    setPending(true);
    const timer = setTimeout(
      () => worker.current?.postMessage({ id, query }),
      65,
    );
    return () => clearTimeout(timer);
  }, [query, composing, enabled, error, attempt]);

  return {
    tags,
    count,
    pending,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
