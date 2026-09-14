import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleCard({ title, eyebrow, className = "", reveal = false, children }: {
  title: string; eyebrow?: string; className?: string; reveal?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(false), id = useId();
  useEffect(() => { if (reveal) setOpen(true); }, [reveal]);
  return <section className={`panel collapsible-card ${className}`}>
    <h2 className="card-heading"><button aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
      <span>{eyebrow && <small className="eyebrow">{eyebrow}</small>}<span>{title}</span></span><ChevronDown size={20} />
    </button></h2>
    <div id={id} className="card-content" hidden={!open}>{children}</div>
  </section>;
}
