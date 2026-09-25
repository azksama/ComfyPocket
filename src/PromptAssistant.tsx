import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Mic, Square, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { t, locale } from "./i18n";
import type { Prompts } from "./promptLibrary";
import {
  applyProposals,
  validateProposals,
  type PromptOptimizer,
  type PromptProposal,
} from "./promptOptimizer";
import mochi from "../assets/brand/expressions/open.webp";
const DRAFT = "mochi-voice-draft-v1";
function readDraft() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT) || "{}");
    return {
      description:
        typeof value.description === "string"
          ? value.description.slice(0, 12000)
          : "",
      language:
        value.language === "en"
          ? ("en" as const)
          : value.language === "fr"
            ? ("fr" as const)
            : locale(),
    };
  } catch {
    return { description: "", language: locale() };
  }
}
export default function PromptAssistant({
  side,
  values,
  onChange,
  onClose,
  adapter,
}: {
  side: keyof Prompts;
  values: Prompts;
  onChange: (v: Prompts) => void;
  onClose: () => void;
  adapter?: PromptOptimizer;
}) {
  const [draft, setDraft] = useState(readDraft);
  const [phase, setPhase] = useState<
    "idle" | "listening" | "optimizing" | "review"
  >("idle");
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [proposals, setProposals] = useState<
    (PromptProposal & { selected: boolean })[]
  >([]);
  const request = useRef<AbortController | null>(null);
  const busy = phase === "listening" || phase === "optimizing";
  useEffect(() => () => request.current?.abort(), []);
  function save(next: typeof draft) {
    setDraft(next);
    try {
      localStorage.setItem(DRAFT, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setPhase("idle");
  }
  async function run(dictation: boolean) {
    if (!adapter || busy || (dictation && !adapter.dictate)) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPhase(dictation ? "listening" : "optimizing");
    try {
      if (dictation) {
        const text = await adapter.dictate!(draft.language, controller.signal);
        if (controller.signal.aborted) return;
        save({
          ...draft,
          description: (
            (draft.description ? draft.description + " " : "") + text
          ).slice(0, 12000),
        });
        setPhase("idle");
      } else {
        const result = validateProposals(
          await adapter.optimize({ ...draft, side }, controller.signal),
        );
        if (controller.signal.aborted) return;
        setProposals(result.map((p) => ({ ...p, selected: true })));
        setPhase("review");
      }
    } catch {
      if (!controller.signal.aborted) {
        setError(
          t(
            "Impossible de préparer les tags. Votre description est conservée ; réessayez.",
          ),
        );
        setPhase("idle");
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  return (
    <Modal
      title={t("Assistant vocal")}
      className="prompt-assistant"
      onClose={() => {
        cancel();
        onClose();
      }}
    >
      <div className="assistant-intro">
        <img src={mochi} alt="" />
        <div>
          <h3>{adapter ? adapter.name : t("De votre idée aux tags")}</h3>
          <p>
            {t(
              "Décrivez votre scène, puis choisissez les blocs à ajouter au prompt.",
            )}
          </p>
        </div>
      </div>
      {!adapter && (
        <div className="assistant-availability">
          <strong>{t("En attente du modèle")}</strong>
          <p>
            {t(
              "La voix et l’optimisation seront disponibles lorsque le modèle sera connecté. Vous pouvez déjà préparer votre description.",
            )}
          </p>
        </div>
      )}
      <label>
        {t("Langue de la description")}
        <select
          disabled={busy}
          value={draft.language}
          onChange={(e) =>
            save({ ...draft, language: e.target.value as "fr" | "en" })
          }
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        {t("Décrivez votre idée")}
        <textarea
          disabled={busy}
          maxLength={12000}
          value={draft.description}
          placeholder={t(
            "Une fille avec une robe rouge, des yeux bleus et des cheveux blancs coupés au carré…",
          )}
          onChange={(e) => save({ ...draft, description: e.target.value })}
        />
      </label>
      <div className="assistant-draft-status">
        <span>
          {storageError
            ? t("Brouillon conservé pour cette session uniquement.")
            : t("Brouillon enregistré sur cet appareil.")}
        </span>
        <span>{draft.description.length}/12 000</span>
      </div>
      <div className="assistant-actions">
        <button
          disabled={!adapter?.dictate || busy}
          onClick={() => void run(true)}
        >
          <Mic size={18} />
          {t("Dicter")}
        </button>
        <button
          className="primary"
          disabled={!adapter || busy || !draft.description.trim()}
          onClick={() => void run(false)}
        >
          <Sparkles size={18} />
          {t("Proposer des tags")}
        </button>
      </div>
      {busy && (
        <div className="assistant-progress" role="status">
          <LoaderCircle className="spin" size={20} />
          <span>
            {phase === "listening"
              ? t("Mochi vous écoute…")
              : t("Préparation des blocs…")}
          </span>
          <button onClick={cancel}>
            <Square size={15} />
            {t("Annuler")}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {phase === "review" && (
        <section className="assistant-review">
          <h3>{t("Vérifier avant d’insérer")}</h3>
          <p>
            {t(
              "Modifiez les tags et décochez les blocs à ignorer. Votre prompt existant sera conservé.",
            )}
          </p>
          {proposals.map((p, i) => (
            <article key={i}>
              <label className="proposal-check">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, selected: e.target.checked } : v,
                      ),
                    )
                  }
                />
                {t("Inclure le bloc {0}", [i + 1])}
              </label>
              <label>
                {t("Titre du bloc")}
                <input
                  maxLength={80}
                  value={p.title}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, title: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("Destination")}
                <select
                  value={p.side}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i
                          ? { ...v, side: e.target.value as keyof Prompts }
                          : v,
                      ),
                    )
                  }
                >
                  <option value="positive">{t("Positif")}</option>
                  <option value="negative">{t("Négatif")}</option>
                </select>
              </label>
              <label>
                {t("Tags proposés")}
                <textarea
                  maxLength={20000}
                  value={p.text}
                  onChange={(e) =>
                    setProposals(
                      proposals.map((v, n) =>
                        n === i ? { ...v, text: e.target.value } : v,
                      ),
                    )
                  }
                />
              </label>
            </article>
          ))}
          <button
            className="primary"
            disabled={!proposals.some((p) => p.selected && p.text.trim())}
            onClick={() => {
              onChange(
                applyProposals(
                  values,
                  proposals.filter((p) => p.selected && p.text.trim()),
                ),
              );
              onClose();
            }}
          >
            <Check size={18} />
            {t("Insérer les blocs sélectionnés")}
          </button>
        </section>
      )}
    </Modal>
  );
}
