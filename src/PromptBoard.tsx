import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { t } from "./i18n";
import {
  parsePrompt,
  serializePrompt,
  movePart,
  type PromptPart,
} from "./promptDocument";
import {
  readPromptLibrary,
  writePromptLibrary,
  promptStorageError,
} from "./promptLibrary";

type Props = {
  value: string;
  side: "positive" | "negative";
  onChange: (text: string) => void;
  editor: (
    text: string,
    title: string,
    change: (text: string) => void,
    close: () => void,
  ) => ReactNode;
};
export default function PromptBoard({ value, side, onChange, editor }: Props) {
  const [parts, setParts] = useState(() => parsePrompt(value));
  const [editing, setEditing] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const emitted = useRef(value);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    over: string;
    y: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(parsePrompt(value));
      setEditing(null);
    }
  }, [value]);
  function commit(next: PromptPart[]) {
    setParts(next);
    emitted.current = serializePrompt(next);
    onChange(emitted.current);
    setError("");
  }
  function update(id: string, patch: Partial<PromptPart>) {
    commit(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  const label = (p: PromptPart) =>
    p.title === null ? t("Texte libre") : p.title || t("Bloc sans titre");
  function move(id: string, to: number) {
    const from = parts.findIndex((p) => p.id === id);
    const next = movePart(parts, from, to);
    if (next === parts) return;
    commit(next);
    setAnnouncement(
      t("{0} déplacé en position {1} sur {2}.", [
        label(parts[from]),
        to + 1,
        parts.length,
      ]),
    );
  }
  function add(named: boolean) {
    const part = {
      id: crypto.randomUUID(),
      title: named ? t("Nouveau bloc") : null,
      text: "",
    };
    commit([...parts.filter((p) => p.title !== null || p.text.length), part]);
    requestAnimationFrame(() => {
      const card = scroll.current?.querySelector<HTMLElement>(
        `[data-prompt-part="${part.id}"]`,
      );
      card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const field = card?.querySelector<HTMLInputElement>("input");
      field?.focus();
      field?.select();
      if (!named) setEditing(part.id);
    });
  }
  function save(p: PromptPart) {
    try {
      const saved = readPromptLibrary("blocks");
      writePromptLibrary("blocks", [
        {
          id: crypto.randomUUID(),
          title: label(p),
          positive: side === "positive" ? p.text : "",
          negative: side === "negative" ? p.text : "",
          at: Date.now(),
        },
        ...saved,
      ]);
      setAnnouncement(t("Bloc enregistré dans la bibliothèque."));
      setError("");
    } catch (e) {
      setError(promptStorageError(e));
    }
  }
  const active = parts.find((p) => p.id === editing);
  return (
    <>
      <div
        className="prompt-board"
        ref={scroll}
        role="tabpanel"
        id="prompt-panel"
        aria-labelledby={`tab-${side}`}
      >
        <p className="board-description">
          {t("Un bloc par idée. Déplacez-les pour organiser votre prompt.")}
        </p>
        <div className="prompt-parts" aria-label={t("Sections du prompt")}>
          {parts.map((p, index) => (
            <article
              key={p.id}
              data-prompt-part={p.id}
              className={`prompt-part ${p.title === null ? "free-part" : "named-part"} ${dragging === p.id ? "part-dragging" : ""} ${over === p.id && over !== dragging ? "part-drop" : ""}`}
            >
              <header>
                <button
                  className="part-grip"
                  aria-label={t("Déplacer {0}", [label(p)])}
                  onKeyDown={(e) => {
                    if (
                      ["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)
                    ) {
                      e.preventDefault();
                      move(
                        p.id,
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? parts.length - 1
                            : index + (e.key === "ArrowUp" ? -1 : 1),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    drag.current = {
                      id: p.id,
                      over: p.id,
                      y: e.clientY,
                      moved: false,
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    if (Math.abs(e.clientY - d.y) > 6) d.moved = true;
                    if (!d.moved) return;
                    setDragging(d.id);
                    const target = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-prompt-part]");
                    if (target && scroll.current?.contains(target)) {
                      d.over = target.dataset.promptPart!;
                      setOver(d.over);
                    }
                    const box = scroll.current?.getBoundingClientRect();
                    if (box && scroll.current) {
                      if (e.clientY < box.top + 50)
                        scroll.current.scrollTop -= 12;
                      if (e.clientY > box.bottom - 50)
                        scroll.current.scrollTop += 12;
                    }
                  }}
                  onPointerUp={() => {
                    const d = drag.current;
                    if (d?.moved)
                      move(
                        d.id,
                        parts.findIndex((p) => p.id === d.over),
                      );
                    drag.current = null;
                    setDragging(null);
                    setOver(null);
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDragging(null);
                    setOver(null);
                  }}
                >
                  <GripVertical size={18} />
                </button>
                {p.title === null ? (
                  <strong>
                    <Type size={16} />
                    {t("Texte libre")}
                  </strong>
                ) : (
                  <label className="part-title">
                    <span aria-hidden="true">##</span>
                    <input
                      aria-label={t("Nom du bloc {0}", [index + 1])}
                      maxLength={80}
                      value={p.title}
                      onChange={(e) => update(p.id, { title: e.target.value })}
                    />
                  </label>
                )}
                <span className="part-position">
                  {index + 1}/{parts.length}
                </span>
              </header>
              <button
                className="part-content"
                onClick={() => setEditing(p.id)}
                aria-label={t("Modifier le texte de {0}", [label(p)])}
              >
                <span>{p.text || t("Décrire cette partie du prompt…")}</span>
                <Pencil size={16} />
              </button>
              <footer>
                <div>
                  <button
                    aria-label={t("Monter {0}", [label(p)])}
                    disabled={index === 0}
                    onClick={() => move(p.id, index - 1)}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    aria-label={t("Descendre {0}", [label(p)])}
                    disabled={index === parts.length - 1}
                    onClick={() => move(p.id, index + 1)}
                  >
                    <ArrowDown size={17} />
                  </button>
                </div>
                <div>
                  {p.title !== null && (
                    <button
                      disabled={!p.text.trim()}
                      aria-label={t("Enregistrer {0} dans la bibliothèque", [
                        label(p),
                      ])}
                      onClick={() => save(p)}
                    >
                      <BookmarkPlus size={17} />
                    </button>
                  )}
                  <button
                    aria-label={t("Retirer {0} du prompt", [label(p)])}
                    onClick={() => {
                      commit(parts.filter((item) => item.id !== p.id));
                      setAnnouncement(
                        t(
                          "Section retirée. Vous pouvez annuler cette modification.",
                        ),
                      );
                    }}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </div>
        <div className="board-add">
          <button onClick={() => add(true)}>
            <Plus size={18} />
            {t("Ajouter un bloc")}
          </button>
          <button onClick={() => add(false)}>
            <Type size={18} />
            {t("Texte libre")}
          </button>
        </div>
        <p className="board-status" role="status">
          {announcement}
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
      {active &&
        editor(
          active.text,
          label(active),
          (text) => update(active.id, { text }),
          () => setEditing(null),
        )}
    </>
  );
}
