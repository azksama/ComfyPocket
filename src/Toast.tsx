import { t as tr } from "./i18n";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export default function Toast({ message, error = false, onClose, children }: { message: string; error?: boolean; onClose: () => void; children?: ReactNode }) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => { const timer = setTimeout(() => close.current(), error ? 10000 : 6000); return () => clearTimeout(timer); }, [message, error]);
  return <div className={`toast ${error ? "toast-error" : ""}`} role={error ? "alert" : "status"}><span>{message}</span>{children}<button aria-label={tr("Fermer la notification")} onClick={onClose}><X size={18} /></button></div>;
}
