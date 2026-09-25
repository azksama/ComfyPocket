import VoiceModels, {
  useVoiceStatus,
  dictate,
  voiceAction,
  pcOptimizer,
} from "./VoiceModels";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Mic, Square, Sparkles } from "lucide-react";
import { Modal } from "./Modal";
import { t, locale } from "./i18n";
import { api } from "./api";
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
          ? value.description.slice(0, 5000)
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
  const { status: voice } = useVoiceStatus();
  const optimizer = adapter || (voice?.taggerReady ? pcOptimizer : undefined);
  const [showModels, setShowModels] = useState(false);
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
    if (request.current || busy || (!dictation && !optimizer)) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setPhase(dictation ? "listening" : "optimizing");
    try {
      if (dictation && !adapter?.dictate) {
        const ready = await api<{ ready: boolean }>("/bridge/assistant")
          .then((s) => s.ready)
          .catch(() => false);
        if (controller.signal.aborted) return;
        if (!ready) {
          setShowModels(true);
          setPhase("idle");
          return;
        }
      }
      if (dictation) {
        const text = await (adapter?.dictate ?? dictate)(
          draft.language,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const description = (
          (draft.description ? draft.description + "\n" : "") + text
        ).slice(0, 5000);
        const language =
          adapter || draft.description.trim() ? draft.language : "en";
        save({
          ...draft,
          language,
          description,
        });
        if (optimizer && !adapter?.dictate) {
          setPhase("optimizing");
          const result = validateProposals(
            await optimizer.optimize(
              { description, language, side },
              controller.signal,
            ),
          );
          if (controller.signal.aborted) return;
          setProposals(result.map((p) => ({ ...p, selected: true })));
          setPhase("review");
        } else setPhase("idle");
      } else {
        const result = validateProposals(
          await optimizer!.optimize({ ...draft, side }, controller.signal),
        );
        if (controller.signal.aborted) return;
        setProposals(result.map((p) => ({ ...p, selected: true })));
        setPhase("review");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(
          t(
            "Impossible de préparer les tags. Votre description est conservée ; réessayez.",
          ) + (error instanceof Error ? ` ${error.message}` : ""),
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
          <strong>
            {voice?.taggerReady
              ? "DanbotNL · PC"
              : t("Préparer les modèles sur le PC")}
          </strong>
          <p>
            {t(
              "Whisper transcrit votre voix en anglais sur le PC. DanbotNL transforme votre description en tags à valider.",
            )}
          </p>
        </div>
      )}
      {!adapter && (
        <button
          className="assistant-model-button"
          onClick={() => setShowModels(true)}
        >
          {t("Gérer les modèles")}
        </button>
      )}
      {showModels && (
        <Modal
          title={t("Voix et modèles")}
          className="voice-model-dialog"
          onClose={() => setShowModels(false)}
        >
          <VoiceModels />
        </Modal>
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
          maxLength={5000}
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
        <span>{draft.description.length}/5 000</span>
      </div>
      <div className="assistant-actions">
        <button
          disabled={busy || (!adapter?.dictate && !voice?.supported)}
          onClick={() => void run(true)}
        >
          <Mic size={18} />
          {t("Dicter")}
        </button>
        <button
          className="primary"
          disabled={!optimizer || busy || !draft.description.trim()}
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
              ? voice?.phase === "processing"
                ? t("Transcription en anglais…")
                : t("Mochi vous écoute…")
              : t("Préparation des blocs…")}
          </span>
          {phase === "listening" &&
            !adapter &&
            voice?.phase === "recording" && (
              <button onClick={() => void voiceAction("stop")}>
                {t("Terminer la dictée")}
              </button>
            )}
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
