import { useState } from "react";
import { Languages, Check, ChevronRight } from "lucide-react";
import { Modal } from "./Modal";
import { useLocale, setLocale, t, type Locale } from "./i18n";
import { native } from "./api";
import tea from "../assets/brand/languages/en.webp";
import baguette from "../assets/brand/languages/fr.webp";
export default function LanguagePicker() {
  const language = useLocale(),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button className="language-setting" onClick={() => setOpen(true)}>
        <Languages />
        <span>
          <strong>{t("Langue de l’application")}</strong>
          <small>{language === "fr" ? "Français" : "English"}</small>
        </span>
        <ChevronRight />
      </button>
      {open && (
        <Modal
          title={t("Langue de l’application")}
          className="language-dialog"
          onClose={() => setOpen(false)}
        >
          <div
            className="language-options"
            role="radiogroup"
            aria-label={t("Langue de l’application")}
          >
            {(
              [
                { code: "fr", name: "Français", image: baguette },
                { code: "en", name: "English", image: tea },
              ] as const
            ).map((option) => (
              <button
                key={option.code}
                role="radio"
                aria-checked={language === option.code}
                tabIndex={language === option.code ? 0 : -1}
                onKeyDown={(event) => {
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                    ].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const buttons =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      "[role=radio]",
                    );
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 1
                        : option.code === "fr"
                          ? 1
                          : 0;
                  buttons?.[next]?.click();
                  buttons?.[next]?.focus();
                }}
                onClick={() => {
                  try {
                    setLocale(option.code as Locale);
                    setError("");
                    void native("set_app_language", {
                      language: option.code,
                    }).catch(() => {});
                  } catch {
                    setError(
                      t(
                        "Impossible d’enregistrer cette préférence sur l’appareil.",
                      ),
                    );
                  }
                }}
              >
                <img src={option.image} alt="" />
                <strong>{option.name}</strong>
                {language === option.code && <Check size={20} />}
              </button>
            ))}
          </div>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </>
  );
}
