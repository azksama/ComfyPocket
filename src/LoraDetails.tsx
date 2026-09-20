import { t as tr } from "./i18n";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Modal, Picture, modelPath, shortName } from "./components";
type Info = {
  title: string;
  version: string;
  baseModel: string;
  description: string;
  triggers: string[];
  tags: string[];
};
export default function LoraDetails({
  name,
  onClose,
  onSelect,
  onTriggers,
}: {
  name: string;
  onClose: () => void;
  onSelect: () => void;
  onTriggers?: (words: string[]) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null),
    [error, setError] = useState(""),
    [notes, setNotes] = useState(""),
    [saved, setSaved] = useState(false),
    [inserted, setInserted] = useState("");
  const key = "lora-notes-v1:" + name;
  useEffect(() => {
    let live = true;
    try {
      setNotes(localStorage.getItem(key) ?? "");
    } catch (e) {
      setError(String(e));
    }
    api<Info>(`/bridge/model-info?kind=loras&name=${encodeURIComponent(name)}`)
      .then((value) => {
        if (live) setInfo(value);
      })
      .catch(() => {
        if (live)
          setError(
            tr("Fiche indisponible. Redémarrez le compagnon PC mis à jour."),
          );
      });
    return () => {
      live = false;
    };
  }, [name]);
  return (
    <Modal
      title={shortName(name)}
      className="prompt-library lora-details"
      onClose={onClose}
    >
      <Picture
        path={modelPath("loras", name)}
        alt={tr("Illustration du LoRA")}
      />
      <p className="hint">{name}</p>
      {info ? (
        <>
          <h3>{info.title || shortName(name)}</h3>
          <p>
            {info.baseModel || tr("Modèle de base non renseigné")}
            {info.version ? ` · ${info.version}` : ""}
          </p>
          <p className="hint">
            {tr(
              "Vérifiez que le modèle de base correspond au checkpoint sélectionné.",
            )}
          </p>
          {info.description && (
            <p className="lora-description">{info.description}</p>
          )}
          {info.tags.length > 0 && <p>{info.tags.join(" · ")}</p>}
          <h3>{tr("Mots déclencheurs")}</h3>
          {info.triggers.length ? (
            <div className="row">
              {info.triggers.map((word) => (
                <button
                  key={word}
                  disabled={!onTriggers}
                  onClick={() => {
                    onTriggers?.([word]);
                    setInserted(word);
                  }}
                >
                  {word}
                </button>
              ))}
            </div>
          ) : (
            <p className="hint">
              {tr("Aucun mot déclencheur dans les métadonnées locales.")}
            </p>
          )}
        </>
      ) : (
        !error && <p role="status">{tr("Chargement de la fiche…")}</p>
      )}
      {inserted && (
        <p role="status">
          « {inserted} {tr("» ajouté au prompt positif.")}
        </p>
      )}
      <label>
        {tr("Mes notes")}
        <textarea
          maxLength={4000}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          placeholder={tr("Poids préféré, usages, associations…")}
        />
      </label>
      <footer className="dialog-actions">
        <button
          onClick={() => {
            try {
              localStorage.setItem(key, notes);
              setSaved(true);
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          {tr("Enregistrer les notes")}
        </button>
        <button className="primary" onClick={onSelect}>
          {tr("Ajouter ce LoRA")}
        </button>
      </footer>
      {saved && (
        <p role="status">{tr("Notes enregistrées sur cet appareil.")}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}
