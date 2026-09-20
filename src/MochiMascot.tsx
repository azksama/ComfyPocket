import { useEffect } from "react";
import open from "../assets/brand/expressions/open.webp";
import closed from "../assets/brand/expressions/closed.webp";
import sad from "../assets/brand/expressions/sad.webp";

export function MochiMascot({ jumping = false }: { jumping?: boolean }) {
  return (
    <div
      className={`mochi-mascot ${jumping ? "is-jumping" : "is-sad"}`}
      aria-hidden="true"
    >
      <span className="mochi-shadow" />
      <div className="mochi-body">
        <img
          className="mochi-open"
          src={jumping ? open : sad}
          alt=""
          draggable={false}
        />
        {jumping && (
          <img className="mochi-closed" src={closed} alt="" draggable={false} />
        )}
      </div>
    </div>
  );
}

export function StartupSplash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div
      className="startup-splash"
      role="status"
      aria-label="Démarrage de Mochi"
    >
      <MochiMascot jumping />
      <h1>Mochi</h1>
      <span className="startup-progress" aria-hidden="true" />
    </div>
  );
}
