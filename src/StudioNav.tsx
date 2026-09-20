import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Box,
  Layers,
  MessageSquare,
  SlidersHorizontal,
  Image,
} from "lucide-react";

const sections = [
  { id: "studio-configuration", label: "Configuration", Icon: Bookmark },
  { id: "studio-model", label: "Modèle", Icon: Box },
  { id: "studio-loras", label: "LoRA", Icon: Layers },
  { id: "studio-prompts", label: "Prompts", Icon: MessageSquare },
  { id: "studio-generation", label: "Réglages", Icon: SlidersHorizontal },
  { id: "studio-render", label: "Rendu", Icon: Image },
];

export default function StudioNav({
  active,
  workflow,
}: {
  active: boolean;
  workflow: boolean;
}) {
  const [current, setCurrent] = useState(sections[0].id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = (ref.current?.getBoundingClientRect().bottom ?? 60) + 25;
        let next = sections[0].id;
        for (const { id } of sections) {
          const element = document.getElementById(id);
          if (element && element.getBoundingClientRect().top <= edge) next = id;
        }
        if (
          innerWidth < 900 &&
          scrollY > 0 &&
          innerHeight + scrollY >= document.documentElement.scrollHeight - 4
        )
          next = "studio-render";
        setCurrent(next);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active, workflow]);
  return (
    <nav
      ref={ref}
      className="studio-quick-nav"
      aria-label="Sections de l’Atelier"
    >
      {sections
        .filter((_, index) => !workflow || index === 0 || index === 5)
        .map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-label={`Aller à ${label}`}
            title={label}
            aria-current={current === id ? "location" : undefined}
            onClick={() => {
              const target = document.getElementById(id);
              if (!target) return;
              window.scrollTo({
                top: window.scrollY + target.getBoundingClientRect().top - 76,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
              target.focus({ preventScroll: true });
            }}
          >
            <Icon size={15} />
            <span className="quick-nav-tooltip">{label}</span>
          </button>
        ))}
    </nav>
  );
}
