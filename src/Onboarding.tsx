import { useEffect, useRef } from "react";
import { locale, t } from "./i18n";
import LanguagePicker from "./LanguagePicker";
import { LockSettings } from "./AppLock";
import mochi from "../assets/brand/expressions/open.webp";
import {
  ArrowLeft,
  ArrowRight,
  Monitor,
  Sparkles,
  Images,
  BookOpen,
} from "lucide-react";
import "./Onboarding.css";
export default function Onboarding({
  step,
  onStep,
  onLater,
  onFinish,
  onConnect,
  online,
  leftHanded,
  onHandedness,
  quickMenu,
  onQuickMenu,
}: {
  step: number;
  onStep: (n: number) => void;
  onLater: () => void;
  onFinish: () => void;
  onConnect: () => void;
  online: boolean;
  leftHanded: boolean;
  onHandedness: (v: boolean) => void;
  quickMenu: boolean;
  onQuickMenu: (v: boolean) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);
  const en = locale() === "en";
  const say = (fr: string, enText: string) => (en ? enText : fr);
  const titles = [
    say("Bienvenue chez Mochi", "Welcome to Mochi"),
    say("Votre PC fait la magie", "Your PC does the magic"),
    say("Un atelier à votre main", "A workshop that fits you"),
    say("Votre espace privé", "Your private space"),
    say("Votre première création", "Your first creation"),
  ];
  return (
    <main className="first-run">
      <header className="first-run-top">
        <span>MOCHI</span>
        <button onClick={onLater}>{say("Plus tard", "Later")}</button>
      </header>
      <img className="first-run-mochi" src={mochi} alt="" />
      <p className="eyebrow">
        {say("PREMIERS PAS", "GETTING STARTED")} · {step + 1} / 5
      </p>
      <h1 ref={heading} tabIndex={-1}>
        {titles[step]}
      </h1>
      <div className="first-run-dots" aria-hidden="true">
        {titles.map((title, i) => (
          <span key={title} className={i === step ? "current" : ""} />
        ))}
      </div>
      {step === 0 && (
        <>
          <p>
            {say(
              "Imaginez sur votre téléphone. Générez sur votre ordinateur. Retrouvez toutes vos créations dans un atelier à emporter.",
              "Imagine on your phone. Generate on your computer. Keep all your creations in a portable workshop.",
            )}
          </p>
          <LanguagePicker />
          <div className="first-run-note">
            {say(
              "Mochi utilise votre installation ComfyUI. Votre PC doit rester allumé et connecté pendant la génération.",
              "Mochi uses your ComfyUI installation. Keep your PC on and connected while generating.",
            )}
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <ol className="first-run-list">
            <li>
              {say(
                "Ouvrez Mochi Studio sur le PC et démarrez le moteur.",
                "Open Mochi Studio on your PC and start the engine.",
              )}
            </li>
            <li>
              {say(
                "Connectez les deux appareils au même Wi-Fi et autorisez le pare-feu depuis le lanceur.",
                "Connect both devices to the same Wi-Fi and allow the firewall from the launcher.",
              )}
            </li>
            <li>
              {say(
                "Exportez l’appairage local du lanceur. Ici, ouvrez Ajouter puis importez ce fichier.",
                "Export local pairing from the launcher. Here, open Add and import that file.",
              )}
            </li>
          </ol>
          <button className="primary" onClick={onConnect}>
            <Monitor size={20} />
            {online
              ? say("Gérer mon PC", "Manage my PC")
              : say("Connecter mon PC", "Connect my PC")}
          </button>
          <p role="status">
            {online
              ? say("Votre PC est connecté.", "Your PC is connected.")
              : say(
                  "Aucun PC connecté pour le moment. Vous pouvez continuer et le connecter plus tard.",
                  "No PC connected yet. You can continue and connect it later.",
                )}
          </p>
          <details>
            <summary>
              {say("Si la connexion échoue", "If the connection fails")}
            </summary>
            <p>
              {say(
                "Vérifiez que le lanceur affiche les deux services prêts, utilisez l’appairage local sur le Wi-Fi et réimportez le fichier si le port a changé. Le fichier est privé : ne le partagez pas.",
                "Check that both services are ready in the launcher, use local pairing over Wi-Fi and reimport the file if the port changed. Keep the pairing file private.",
              )}
            </p>
          </details>
        </>
      )}
      {step === 2 && (
        <>
          <p>
            {say(
              "Choisissez où placer vos raccourcis. Ces préférences restent modifiables dans les paramètres.",
              "Choose where your shortcuts appear. You can change these preferences in settings.",
            )}
          </p>
          <label className="switch-row">
            <span>
              {say("Menu rapide de l’atelier", "Workshop quick menu")}
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={quickMenu}
              onChange={(e) => onQuickMenu(e.target.checked)}
            />
          </label>
          <label className="switch-row">
            <span>{say("Mode gaucher", "Left-handed mode")}</span>
            <input
              type="checkbox"
              role="switch"
              checked={leftHanded}
              onChange={(e) => onHandedness(e.target.checked)}
            />
          </label>
          <div className="first-run-note">
            {say(
              "Les raccourcis se superposent au bord de l’écran. Le bouton génération vous ramène directement au résultat.",
              "Shortcuts float along the screen edge. The generation button takes you directly to the result.",
            )}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <p>
            {say(
              "Protégez l’accès à Mochi avec la biométrie de votre téléphone. Vous choisissez le délai de verrouillage après une absence.",
              "Protect access to Mochi with your phone biometrics. Choose how long it waits to lock after you leave.",
            )}
          </p>
          <LockSettings />
          <div className="first-run-note">
            {say(
              "Les images sont enregistrées sur votre PC. Les captures d’écran restent autorisées. Si la biométrie est indisponible, vous pouvez continuer sans l’activer.",
              "Images are stored on your PC. Screenshots remain allowed. If biometrics are unavailable, you can continue without enabling them.",
            )}
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <div className="first-run-feature">
            <Sparkles />
            <div>
              <h2>{t("Atelier")}</h2>
              <p>
                {say(
                  "Choisissez un modèle, ajoutez vos LoRAs et décrivez votre image. Les suggestions de tags, la traduction, les blocs et l’historique vous aident à écrire.",
                  "Choose a model, add LoRAs and describe your image. Tag suggestions, translation, blocks and history help you write.",
                )}
              </p>
            </div>
          </div>
          <div className="first-run-feature">
            <Images />
            <div>
              <h2>{t("Galerie")}</h2>
              <p>
                {say(
                  "Glissez verticalement entre les images. Glissez horizontalement pour favoriser ou supprimer. Un appui long active la sélection multiple.",
                  "Swipe vertically between images. Swipe horizontally to favourite or delete. Long-press for multiple selection.",
                )}
              </p>
            </div>
          </div>
          <div className="first-run-feature">
            <BookOpen />
            <div>
              <h2>{t("Glossaire")}</h2>
              <p>
                {say(
                  "Explorez les tags par thème. Enregistrez vos réglages dans des presets pour retrouver votre style.",
                  "Explore tags by theme. Save your settings as presets to return to your style.",
                )}
              </p>
            </div>
          </div>
        </>
      )}
      <footer className="first-run-actions">
        {step > 0 && (
          <button onClick={() => onStep(step - 1)}>
            <ArrowLeft size={18} />
            {say("Retour", "Back")}
          </button>
        )}
        <button
          className="primary"
          onClick={() => (step === 4 ? onFinish() : onStep(step + 1))}
        >
          {step === 4
            ? say("Ouvrir mon atelier", "Open my workshop")
            : say("Continuer", "Continue")}
          <ArrowRight size={18} />
        </button>
      </footer>
    </main>
  );
}
