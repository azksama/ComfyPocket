import { Sparkles, BookOpen, Heart, ArrowRight, Monitor } from "lucide-react";
import landscape from "../assets/welcome/yofJz.png";
import blossoms from "../assets/welcome/H9L7TJ.png";

export default function Welcome({
  onConnect,
  onExplore,
}: {
  onConnect: () => void;
  onExplore: () => void;
}) {
  return (
    <section className="onboarding" aria-label="Bienvenue dans Mochi">
      <div className="onboarding-collage" aria-label="Exemples d’inspiration">
        <img
          className="welcome-landscape"
          src={landscape}
          alt="Forêt sous un ciel pastel"
        />
        <img
          className="welcome-blossoms"
          src={blossoms}
          alt="Branche fleurie"
        />
        <span>
          <Monitor size={16} /> Imaginé ici. Généré sur votre PC.
        </span>
      </div>
      <div>
        <span className="eyebrow">BIENVENUE DANS VOTRE ATELIER</span>
        <h2>
          De grandes idées.
          <br />
          Au creux de la main.
        </h2>
        <p>
          Votre compagnon ComfyUI : créez depuis votre téléphone, avec toute la
          puissance de votre ordinateur.
        </p>
      </div>
      <div className="onboarding-features">
        <div>
          <Sparkles />
          <span>
            <strong>Créez sans limite</strong>
            <small>Modèles, LoRAs et workflows à portée de main.</small>
          </span>
        </div>
        <div>
          <BookOpen />
          <span>
            <strong>Trouvez les bons mots</strong>
            <small>Prompts et tags Danbooru pour chaque idée.</small>
          </span>
        </div>
        <div>
          <Heart />
          <span>
            <strong>Gardez vos coups de cœur</strong>
            <small>Toutes vos créations, dans votre galerie.</small>
          </span>
        </div>
      </div>
      <div className="onboarding-note">
        Lancez le compagnon sur votre PC, puis importez son fichier d’appairage
        dans Mochi. Votre PC reste le moteur.
      </div>
      <div className="onboarding-actions">
        <button className="primary" onClick={onConnect}>
          Connecter mon PC <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onExplore}>
          Découvrir le glossaire d’abord
        </button>
      </div>
    </section>
  );
}
