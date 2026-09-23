import type { ReactNode } from "react";
const titles = [
  "Bienvenue chez Mochi",
  "Préparez votre moteur",
  "Choisissez votre rythme",
  "Reliez votre téléphone",
  "Votre studio est prêt",
];
export default function Setup({
  step,
  onStep,
  onLater,
  children,
}: {
  step: number;
  onStep: (step: number) => void;
  onLater: () => void;
  children: ReactNode;
}) {
  return (
    <section className="setup">
      <div className="setup-heading">
        <img src="/mochi.webp" alt="" />
        <div>
          <p className="eyebrow">PREMIERS PAS · {step + 1} / 5</p>
          <h1>{titles[step]}</h1>
        </div>
      </div>
      <ol className="setup-steps" aria-label="Étapes de configuration">
        {titles.map((title, i) => (
          <li key={title} aria-current={step === i ? "step" : undefined}>
            <span>{i + 1}</span>
            {title}
          </li>
        ))}
      </ol>
      <div className="setup-body">{children}</div>
      <div className="actions">
        {step > 0 && <button onClick={() => onStep(step - 1)}>Retour</button>}
        <button className="text" onClick={onLater}>
          Reprendre plus tard
        </button>
      </div>
    </section>
  );
}
