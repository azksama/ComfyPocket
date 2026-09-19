import { useEffect, useRef } from "react";
import type { Settings } from "./workflow";
import { writeStored } from "./sessionStorage";

export function useSettingsPersistence(settings: Settings, server: string) {
  const pending = useRef<{ settings: Settings; server: string } | null>(null);
  const flush = () => {
    const value = pending.current;
    if (!value) return;
    pending.current = null;
    writeStored("settings", value.settings);
    if (value.server) writeStored("settings:" + value.server, value.settings);
  };
  useEffect(() => {
    pending.current = { settings, server };
    const timer = setTimeout(flush, 300);
    return () => clearTimeout(timer);
  }, [settings, server]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [server]);
}
