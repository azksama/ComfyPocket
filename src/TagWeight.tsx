import { useState } from "react";
import { Modal } from "./Modal";
import { t } from "./i18n";
import type { WeightedRange } from "./promptWeights";
export default function TagWeight({
  range,
  onApply,
  onClose,
}: {
  range: WeightedRange | null;
  onApply: (weight: number) => void;
  onClose: () => void;
}) {
  const [weight, setWeight] = useState(range?.weight ?? 1);
  return (
    <Modal
      title={t("Poids du tag")}
      onClose={onClose}
      className="weight-dialog"
    >
      {range ? (
        <>
          <p>{range.tag}</p>
          <label>
            {t("Intensité")}
            <input
              type="range"
              min="0"
              max="3"
              step="0.05"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
          </label>
          <label>
            {t("Poids")}
            <input
              type="number"
              min="0"
              max="3"
              step="0.05"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
            />
          </label>
          <p className="hint">
            {t("1 = normal · moins de 1 atténue · plus de 1 renforce")}
          </p>
          <code>{weight === 1 ? range.tag : `(${range.tag}:${weight})`}</code>
          <div className="row">
            <button onClick={() => setWeight(1)}>{t("Réinitialiser")}</button>
            <button
              className="primary"
              disabled={!Number.isFinite(weight) || weight < 0 || weight > 3}
              onClick={() => onApply(weight)}
            >
              {t("Appliquer")}
            </button>
          </div>
        </>
      ) : (
        <p>
          {t(
            "Placez le curseur dans un tag, ou sélectionnez un tag, puis réessayez.",
          )}
        </p>
      )}
    </Modal>
  );
}
