import TagWeight from "./TagWeight";
import { weightRange, setTagWeight, type WeightedRange } from "./promptWeights";
import "./prompt-blocks.css";
import PromptBoard from "./PromptBoard";
import PromptAssistant from "./PromptAssistant";
import { compilePrompt } from "./promptDocument";
import { t as tr, locale } from "./i18n";
import PromptTranslation, { insertTranslation } from "./PromptTranslation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Undo2,
  Redo2,
  Sparkles,
  Languages,
  Mic,
  SlidersHorizontal,
} from "lucide-react";
import { Modal } from "./components";
import { insertTag, tagRange, type Tag } from "./tags";
import PromptTools from "./PromptTools";
import {
  rememberPrompt,
  promptStorageError,
  type Prompts,
} from "./promptLibrary";
import { createCaretMeasurer } from "./caret";
import { usePromptSuggestions } from "./usePromptSuggestions";
import "./prompt-experience.css";

type Side = keyof Prompts;
const sides: Side[] = ["positive", "negative"];
const categories: Record<number, string> = {
  0: "Général",
  1: "Artiste",
  3: "Univers",
  4: "Personnage",
  5: "Méta",
};

function readAutocompletePreference() {
  try {
    return localStorage.getItem("autocomplete-enabled") !== "false";
  } catch {
    return true;
  }
}

function MatchingTag({ name, query }: { name: string; query: string }) {
  const at = name.indexOf(query);
  const visible = name.replace(/_/g, " ");
  return at < 0 ? (
    visible
  ) : (
    <>
      {visible.slice(0, at)}
      <mark>{visible.slice(at, at + query.length)}</mark>
      {visible.slice(at + query.length)}
    </>
  );
}

export default function PromptEditor({
  initialTab,
  initialTool,
  fragmentTitle,
  values,
  onChange,
  onClose,
}: {
  initialTab: Side;
  fragmentTitle?: string;
  initialTool?: "history" | "blocks" | "check";
  values: Prompts;
  onChange: (values: Prompts) => void;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<"text" | "blocks">(() =>
    !fragmentTitle && /^\s*##[ \t]+/m.test(values[initialTab])
      ? "blocks"
      : "text",
  );
  const [weight, setWeight] = useState<WeightedRange | null | undefined>(
    undefined,
  );
  const weightSelection = useRef({ start: 0, end: 0 });
  const [assistant, setAssistant] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const [translation, setTranslation] = useState<
    { start: number; end: number } | null | undefined
  >(undefined);
  const translationSelection = useRef<{ start: number; end: number } | null>(
    null,
  );
  const [side, setSide] = useState(initialTab);
  const [caret, setCaret] = useState(values[initialTab].length);
  const [active, setActive] = useState(0);
  const [composing, setComposing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [enabled, setEnabled] = useState(readAutocompletePreference);
  const [saveError, setSaveError] = useState("");
  const [preferenceWarning, setPreferenceWarning] = useState("");
  const [bubbleTop, setBubbleTop] = useState(60);
  const [scroll, setScroll] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const measurer = useRef<ReturnType<typeof createCaretMeasurer> | null>(null);
  const history = useRef<{ undo: Prompts[]; redo: Prompts[] }>({
    undo: [],
    redo: [],
  });
  const value = values[side];
  const comment = /^\s*#/.test(
    value.slice(value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1, caret),
  );
  const query =
    layout === "text" && !comment ? tagRange(value, caret).query : "";
  const bubbleVisible = enabled && !dismissed && !!query;
  const { tags, count, pending, error, retry } = usePromptSuggestions(
    dismissed ? "" : query,
    enabled && layout === "text",
    composing,
  );

  const placeBubble = () => {
    const field = input.current,
      position = measurer.current;
    if (!field || !position || !bubbleVisible) return;
    let top = position.measure(caret) + 8;
    const available = field.clientHeight - 72;
    if (top > available) {
      field.scrollTop += top - Math.max(38, available);
      top = position.measure(caret) + 8;
    }
    setBubbleTop(Math.max(0, top));
  };
  useLayoutEffect(() => {
    if (!input.current) return;
    const position = createCaretMeasurer(input.current);
    measurer.current = position;
    return () => {
      position.dispose();
      measurer.current = null;
    };
  }, [layout]);
  useLayoutEffect(placeBubble, [caret, value, bubbleVisible, scroll]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      measurer.current?.resize();
      placeBubble();
    });
    if (input.current) observer.observe(input.current);
    return () => observer.disconnect();
  }, [caret, bubbleVisible]);
  useEffect(() => {
    const viewport = window.visualViewport,
      dialog = anchor.current?.closest("dialog");
    const resize = () => {
      dialog?.style.setProperty(
        "--editor-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      dialog?.classList.toggle(
        "compact-editor",
        (viewport?.height ?? innerHeight) < 560,
      );
      dialog?.style.setProperty(
        "--editor-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(caret, caret);
  }, [side, layout]);
  useEffect(() => {
    setActive(0);
  }, [tags]);
  useEffect(() => {
    if (!bubbleVisible || pending) return;
    const option = bubble.current?.querySelector<HTMLElement>(`#tag-${active}`);
    if (!option || !bubble.current) return;
    // Scroll only the suggestions, never the textarea or the entire modal.
    if (option.offsetTop < bubble.current.scrollTop)
      bubble.current.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      bubble.current.scrollTop + bubble.current.clientHeight
    ) {
      bubble.current.scrollTop =
        option.offsetTop + option.offsetHeight - bubble.current.clientHeight;
    }
  }, [active, bubbleVisible, pending]);

  function focusAt(position: number) {
    setCaret(position);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }
  function update(next: Prompts) {
    if (next.positive === values.positive && next.negative === values.negative)
      return;
    history.current.undo.push({ ...values });
    if (history.current.undo.length > 80) history.current.undo.shift();
    history.current.redo = [];
    onChange(next);
    setDismissed(false);
    setSaveError("");
  }
  function select(tag: Tag) {
    if (pending || composing) return;
    const next = insertTag(value, caret, tag.name);
    update({ ...values, [side]: next.text });
    focusAt(next.caret);
  }
  function travel(direction: "undo" | "redo") {
    const next = history.current[direction].pop();
    if (!next) return;
    history.current[direction === "undo" ? "redo" : "undo"].push({ ...values });
    onChange(next);
    setDismissed(false);
    focusAt(next[side].length);
  }
  function finish() {
    try {
      if (!fragmentTitle) rememberPrompt(values);
      onClose();
    } catch (reason) {
      setSaveError(promptStorageError(reason));
    }
  }
  function changeSide(next: Side) {
    setSide(next);
    setCaret(values[next].length);
    setDismissed(false);
  }
  function toggleAutocomplete(checked: boolean) {
    setEnabled(checked);
    setPreferenceWarning("");
    try {
      localStorage.setItem("autocomplete-enabled", String(checked));
    } catch {
      setPreferenceWarning(
        tr(
          "Ce choix s’applique pour cette session ; il n’a pas pu être enregistré.",
        ),
      );
    }
  }

  return (
    <Modal
      title={fragmentTitle || tr("Écrire votre image")}
      className="prompt-editor"
      onClose={finish}
    >
      <div ref={anchor} />
      {
        <div className="editor-mode-bar">
          {!fragmentTitle && (
            <div role="group" aria-label={tr("Affichage du prompt")}>
              <button
                aria-pressed={layout === "text"}
                onClick={() => setLayout("text")}
              >
                {tr("Texte")}
              </button>
              <button
                aria-pressed={layout === "blocks"}
                onClick={() => setLayout("blocks")}
              >
                {tr("Blocs")}
              </button>
            </div>
          )}
          <button
            className="voice-entry"
            aria-label={tr("Assistant vocal")}
            onClick={() => setAssistant(true)}
          >
            <Mic size={18} />
            <span>{tr("Assistant vocal")}</span>
          </button>
        </div>
      }
      {layout === "text" && (
        <label className="autocomplete-setting">
          <span>{tr("Autocomplétion")}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label={tr("Activer l’autocomplétion")}
            checked={enabled}
            onChange={(event) => toggleAutocomplete(event.target.checked)}
          />
        </label>
      )}
      {layout === "text" && (
        <button
          className="prompt-translate-button"
          onPointerDown={() => {
            const field = input.current;
            translationSelection.current =
              field && document.activeElement === field
                ? { start: field.selectionStart, end: field.selectionEnd }
                : null;
          }}
          onClick={() => setTranslation(translationSelection.current)}
        >
          <Languages size={18} />
          {tr("Traduire des mots")}
        </button>
      )}
      {!fragmentTitle && (
        <PromptTools
          initialPage={initialTool}
          values={values}
          onChange={(next) => {
            update(next);
            setCaret(next[side].length);
            if (/^\s*##[ \t]+/m.test(next[side])) setLayout("blocks");
          }}
        />
      )}
      {!fragmentTitle && (
        <div
          className="editor-tabs"
          role="tablist"
          aria-label={tr("Type de prompt")}
        >
          {sides.map((tab, index) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              role="tab"
              aria-selected={side === tab}
              aria-controls="prompt-panel"
              tabIndex={side === tab ? 0 : -1}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                changeSide(
                  event.key === "Home"
                    ? "positive"
                    : event.key === "End"
                      ? "negative"
                      : tab === "positive"
                        ? "negative"
                        : "positive",
                );
              }}
              onClick={() => changeSide(tab)}
            >
              <span>0{index + 1}</span>
              {tab === "positive" ? tr("Positif") : tr("Négatif")}
              <small
                aria-label={tr("{0} caractères", [
                  compilePrompt(values[tab]).length,
                ])}
              >
                {compilePrompt(values[tab]).length}
              </small>
            </button>
          ))}
        </div>
      )}
      {layout === "blocks" ? (
        <PromptBoard
          key={side}
          side={side}
          value={value}
          onChange={(text) => update({ ...values, [side]: text })}
          editor={(text, title, change, close) => (
            <PromptEditor
              fragmentTitle={title}
              initialTab="positive"
              values={{ positive: text, negative: "" }}
              onChange={(next) => change(next.positive)}
              onClose={close}
            />
          )}
        />
      ) : (
        <div
          className="editor-paper"
          data-suggesting={bubbleVisible}
          role={fragmentTitle ? "group" : "tabpanel"}
          id={fragmentTitle ? "prompt-panel-fragment" : "prompt-panel"}
          aria-labelledby={fragmentTitle ? undefined : `tab-${side}`}
          aria-label={fragmentTitle ? tr("Texte du bloc") : undefined}
        >
          <label className="sr-only" htmlFor="prompt-text">
            {fragmentTitle
              ? tr("Texte du bloc")
              : side === "positive"
                ? tr("Prompt positif")
                : tr("Prompt négatif")}
          </label>
          <textarea
            id="prompt-text"
            ref={input}
            value={value}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-autocomplete={enabled ? "list" : "none"}
            aria-controls={enabled ? "tag-suggestions" : undefined}
            aria-activedescendant={
              bubbleVisible && tags[active] && !pending
                ? `tag-${active}`
                : undefined
            }
            placeholder={
              side === "positive"
                ? tr(
                    "Imaginez la scène. Ajoutez des tags, des détails, une lumière…",
                  )
                : tr("Décrivez les éléments que vous souhaitez éviter…")
            }
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onChange={(event) => {
              update({ ...values, [side]: event.target.value });
              setCaret(event.target.selectionStart);
            }}
            onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
            onSelect={(event) => {
              setCaret(event.currentTarget.selectionStart);
              weightSelection.current = {
                start: event.currentTarget.selectionStart,
                end: event.currentTarget.selectionEnd,
              };
            }}
            onKeyDown={(event) => {
              if (composing || event.nativeEvent.isComposing) return;
              if (
                (event.ctrlKey || event.metaKey) &&
                ["z", "y"].includes(event.key.toLowerCase())
              ) {
                event.preventDefault();
                travel(
                  event.shiftKey || event.key.toLowerCase() === "y"
                    ? "redo"
                    : "undo",
                );
                return;
              }
              if (event.key === "Escape" && bubbleVisible) {
                event.preventDefault();
                event.stopPropagation();
                setDismissed(true);
                return;
              }
              if (!bubbleVisible || pending || !tags.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive(
                  (index) =>
                    (index +
                      (event.key === "ArrowDown" ? 1 : tags.length - 1)) %
                    tags.length,
                );
              }
              if (
                (event.key === "Enter" && !event.shiftKey) ||
                event.key === "Tab"
              ) {
                event.preventDefault();
                select(tags[active]);
              }
            }}
          />
          <div
            ref={bubble}
            tabIndex={0}
            hidden={!bubbleVisible}
            className="suggestion-bubble"
            aria-busy={pending}
            style={{
              top: bubbleTop,
              maxHeight: `min(200px, calc(100% - ${bubbleTop}px))`,
            }}
          >
            <div className="suggestion-heading">
              <span>
                <Sparkles size={14} /> Danbooru
              </span>
              <small>
                {error
                  ? tr("Saisie libre")
                  : count
                    ? tr("{0} tags · hors ligne", [
                        count.toLocaleString(locale()),
                      ])
                    : tr("Préparation des tags…")}
              </small>
            </div>
            <div
              role="listbox"
              id="tag-suggestions"
              aria-label={tr("Suggestions de tags")}
              className="tag-suggestions"
            >
              {tags.map((tag, index) => (
                <div
                  role="option"
                  id={`tag-${index}`}
                  key={tag.name}
                  aria-selected={active === index}
                  aria-disabled={pending}
                  className={`tag-option ${active === index ? "highlighted" : ""}`}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => select(tag)}
                >
                  <span className={`tag-dot category-${tag.category}`} />
                  <span>
                    <strong>
                      <MatchingTag name={tag.name} query={query} />
                    </strong>
                    <small>
                      {tr(categories[tag.category] ?? "Tag")} ·{" "}
                      {tag.count.toLocaleString(locale())}
                    </small>
                  </span>
                  <span className="tag-add" aria-hidden="true">
                    +
                  </span>
                </div>
              ))}
              {!tags.length && (
                <span className="suggestion-empty">
                  {error
                    ? tr("Suggestions indisponibles")
                    : pending
                      ? tr("Recherche de tags…")
                      : tr("Aucun tag correspondant")}
                </span>
              )}
            </div>
            {error && (
              <button className="suggestion-retry" onClick={retry}>
                {" "}
                {tr("Réessayer les suggestions")}{" "}
              </button>
            )}
          </div>
        </div>
      )}
      {layout === "text" && (
        <p className="editor-hint" role="status">
          {preferenceWarning ||
            (!enabled
              ? tr("Autocomplétion désactivée")
              : error ||
                (count
                  ? tr("{0} tags · suggestions hors ligne", [
                      count.toLocaleString(locale()),
                    ])
                  : tr("Préparation des suggestions…")))}
        </p>
      )}
      {assistant && (
        <PromptAssistant
          side={side}
          values={values}
          onChange={(next) => {
            update(
              fragmentTitle
                ? { ...values, [side]: compilePrompt(next[side]) }
                : next,
            );
            if (!fragmentTitle) setLayout("blocks");
          }}
          onClose={() => setAssistant(false)}
        />
      )}
      {saveError && (
        <div className="editor-save-error" role="alert">
          <p>
            {saveError} {tr("Vos prompts restent appliqués.")}
          </p>
          <button onClick={onClose}>{tr("Fermer sans historique")}</button>
        </div>
      )}
      {translation !== undefined && (
        <PromptTranslation
          initial={
            translation ? value.slice(translation.start, translation.end) : ""
          }
          onClose={() => setTranslation(undefined)}
          onInsert={(text) => {
            const next = insertTranslation(value, text, translation);
            update({ ...values, [side]: next.text });
            setTranslation(undefined);
            focusAt(next.caret);
          }}
        />
      )}
      {weight !== undefined && (
        <TagWeight
          range={weight}
          onClose={() => setWeight(undefined)}
          onApply={(v) => {
            if (weight) {
              update({ ...values, [side]: setTagWeight(value, weight, v) });
            }
            setWeight(undefined);
          }}
        />
      )}
      <footer className="editor-footer">
        <div>
          {layout === "text" && (
            <button
              aria-label={tr("Poids du tag")}
              onPointerDown={() => {
                const el = input.current;
                weightSelection.current = {
                  start: el?.selectionStart ?? caret,
                  end: el?.selectionEnd ?? caret,
                };
              }}
              onClick={() =>
                setWeight(
                  weightRange(
                    value,
                    weightSelection.current.start,
                    weightSelection.current.end,
                  ),
                )
              }
            >
              <SlidersHorizontal size={19} />
            </button>
          )}
          <button
            aria-label={tr("Annuler la dernière modification")}
            disabled={!history.current.undo.length}
            onClick={() => travel("undo")}
          >
            <Undo2 size={19} />
          </button>
          <button
            aria-label={tr("Rétablir la modification")}
            disabled={!history.current.redo.length}
            onClick={() => travel("redo")}
          >
            <Redo2 size={19} />
          </button>
        </div>
        <button className="primary" onClick={finish}>
          <Check size={18} /> {tr("Terminé")}{" "}
        </button>
      </footer>
    </Modal>
  );
}
