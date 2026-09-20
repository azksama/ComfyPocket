import { t as tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
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
  leftHanded,
  onGenerate,
  generating,
}: {
  onGenerate: () => void;
  generating: boolean;
  active: boolean;
  workflow: boolean;
  leftHanded: boolean;
}) {
  const [current, setCurrent] = useState(sections[0].id);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = 40;
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
      className={`studio-quick-nav ${leftHanded ? "on-left" : "on-right"}`}
      aria-label={tr("Sections de l’Atelier")}
    >
      {sections
        .filter((_, index) => !workflow || index === 0 || index === 5)
        .map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-label={tr("Aller à {0}", [label])}
            title={tr(label)}
            aria-current={current === id ? "location" : undefined}
            onClick={() => {
              const target = document.getElementById(id);
              if (!target) return;
              window.scrollTo({
                top: window.scrollY + target.getBoundingClientRect().top - 24,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
              target.focus({ preventScroll: true });
            }}
          >
            <Icon size={15} />
            <span className="quick-nav-tooltip">{tr(label)}</span>
          </button>
        ))}
      <button
        className="quick-generate"
        aria-label={tr("Générer depuis le menu rapide")}
        title={tr("Générer l’image")}
        disabled={generating}
        onClick={onGenerate}
      >
        <Sparkles size={17} />
      </button>
    </nav>
  );
}
