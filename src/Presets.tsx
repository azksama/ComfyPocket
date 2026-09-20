import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Plus,
  Trash2,
  Pencil,
  Search,
  Upload,
  RotateCcw,
} from "lucide-react";
import { Modal, Picture, shortName, type ViewItem } from "./components";
import {
  parsePreset,
  readPresets,
  writePresets,
  type InferencePreset,
} from "./presetStore";
import { losslessJson, type Settings } from "./workflow";
import { imageUrl } from "./api";
import type { Workflow } from "./api";
export default function Presets({
  image,
  settings,
  mode,
  workflow,
  onApply,
  request,
}: {
  image?: ViewItem;
  request?: { id: number; create?: boolean };
  settings: Settings;
  mode: "simple" | "workflow";
  workflow: Workflow | null;
  onApply: (preset: InferencePreset) => void;
}) {
  const [current, setCurrent] = useState<InferencePreset | null>(null);
  const [libraryReady, setLibraryReady] = useState(false);
  const [open, setOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [items, setItems] = useState<InferencePreset[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [renaming, setRenaming] = useState<string | null>(null),
    [rename, setRename] = useState(""),
    [undo, setUndo] = useState<InferencePreset | null>(null);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const show = (create = false) => {
    setError("");
    setMessage("");
    setLibraryReady(false);
    setItems([]);
    try {
      setItems(readPresets());
      setLibraryReady(true);
    } catch (e) {
      setError(String(e));
    }
    setOpen(true);
    setCreating(create);
  };
  useEffect(() => {
    if (request?.id) show(!!request.create);
  }, [request?.id]);
  const store = (next: InferencePreset[]) => {
    if (!libraryReady)
      throw Error("La bibliothèque est illisible. Son contenu a été conservé.");
    writePresets(next);
    setItems(next);
  };
  const action = (fn: () => void) => {
    setError("");
    try {
      fn();
    } catch (e) {
      setError(String(e));
    }
  };
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const filtered = items.filter((p) =>
    `${p.name} ${p.settings.model}`
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .includes(
        search
          .toLocaleLowerCase("fr")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, ""),
      ),
  );
  const save = async () => {
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      let thumbnail: string | undefined;
      if (image) {
        const img = new Image();
        img.src = image.url || (await imageUrl(image.path));
        await img.decode();
        const canvas = document.createElement("canvas"),
          ratio = 160 / Math.max(img.naturalWidth, img.naturalHeight);
        canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw Error("Création de la vignette impossible.");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        thumbnail = canvas.toDataURL("image/jpeg", 0.75);
      }
      const preset = parsePreset({
        id: crypto.randomUUID(),
        name,
        settings,
        mode,
        workflow,
        thumbnail,
        createdAt: Date.now(),
      });
      store([preset, ...readPresets()]);
      setCurrent(preset);
      setName("");
      setCreating(false);
      setMessage(`« ${preset.name} » enregistré.`);
    } catch (e) {
      setError(String(e));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <section className="studio-configuration">
        <div className="studio-section-heading">
          <h2>Votre configuration</h2>
          <button
            className="inline-action"
            aria-label="Mes presets"
            onClick={() => show()}
          >
            Presets ↗
          </button>
        </div>
        <button className="preset-current" onClick={() => show()}>
          {current?.thumbnail ? (
            <img src={current.thumbnail} alt="" />
          ) : (
            <span className="preset-current-icon">
              <Bookmark size={20} />
            </span>
          )}
          <span>
            <strong>
              {current &&
              current.mode === mode &&
              JSON.stringify(current.workflow) === JSON.stringify(workflow) &&
              JSON.stringify(current.settings) === JSON.stringify(settings)
                ? current.name
                : "Configuration personnalisée"}
            </strong>
            <small>
              {settings.model ? shortName(settings.model) : "Choisir un modèle"}{" "}
              · {settings.width} × {settings.height}
            </small>
          </span>
          <Bookmark size={18} />
        </button>
      </section>
      {open && (
        <Modal
          title="Mes presets"
          className="presets-page"
          onClose={() => {
            if (!saveLock.current) setOpen(false);
          }}
        >
          <div className="presets-content">
            <div className="preset-toolbar">
              <label className="search-box">
                <Search size={18} />
                <input
                  aria-label="Rechercher un preset"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un preset…"
                />
              </label>
              <button
                className="primary"
                disabled={!libraryReady || (mode === "workflow" && !workflow)}
                onClick={() => {
                  setName("");
                  setError("");
                  setCreating(true);
                }}
              >
                <Plus size={18} /> Nouveau preset
              </button>
            </div>
            {mode === "workflow" && !workflow && (
              <p className="hint">
                Validez le workflow API avant de l’enregistrer.
              </p>
            )}
            {error && !creating && <p role="alert">{error}</p>}
            <div className="inference-presets">
              {filtered.map((p) => (
                <article className="inference-preset" key={p.id}>
                  {renaming === p.id ? (
                    <div className="preset-rename">
                      <label>
                        Nouveau titre
                        <input
                          autoFocus
                          maxLength={80}
                          value={rename}
                          onChange={(e) => setRename(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={!rename.trim()}
                        onClick={() =>
                          action(() => {
                            store(
                              items.map((i) =>
                                i.id === p.id
                                  ? { ...i, name: rename.trim() }
                                  : i,
                              ),
                            );
                            setRenaming(null);
                          })
                        }
                      >
                        Valider le titre
                      </button>
                      <button onClick={() => setRenaming(null)}>Annuler</button>
                    </div>
                  ) : (
                    <>
                      <button
                        className="preset-load"
                        aria-label={`Charger ${p.name}`}
                        onClick={() => {
                          onApply(parsePreset(p));
                          setOpen(false);
                        }}
                      >
                        <>
                          {p.thumbnail ? (
                            <img
                              className="preset-thumbnail"
                              src={p.thumbnail}
                              alt=""
                            />
                          ) : (
                            <Bookmark size={20} />
                          )}
                        </>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.mode === "workflow"
                              ? "Workflow API"
                              : shortName(p.settings.model)}{" "}
                            · {p.settings.width} × {p.settings.height}
                          </small>
                          <small>
                            {p.settings.steps} steps · {p.settings.loras.length}{" "}
                            LoRA ·{" "}
                            {p.settings.hires.enabled
                              ? "Hires Fix"
                              : "Sans Hires Fix"}
                          </small>
                        </span>
                      </button>
                      <div className="preset-tools">
                        <button
                          aria-label={`Renommer ${p.name}`}
                          onClick={() => {
                            setRenaming(p.id);
                            setRename(p.name);
                          }}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          aria-label={`Supprimer le preset ${p.name}`}
                          onClick={() =>
                            action(() => {
                              store(items.filter((i) => i.id !== p.id));
                              setUndo(p);
                              setMessage("Preset supprimé.");
                            })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
            {items.length > 0 && !filtered.length && (
              <div className="preset-empty">
                <Search size={30} />
                <p>Aucun preset ne correspond à votre recherche.</p>
                <button onClick={() => setSearch("")}>
                  Effacer la recherche
                </button>
              </div>
            )}
            {!items.length && (
              <div className="preset-empty">
                <Bookmark size={34} />
                <p>Vos réglages favoris, prêts à être retrouvés.</p>
              </div>
            )}
            <label className="file-picker">
              <Upload size={17} /> Importer un preset JSON
              <input
                type="file"
                disabled={!libraryReady}
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setError("");
                  try {
                    if (file.size > 10 * 1024 ** 2)
                      throw Error("Preset supérieur à 10 Mo.");
                    const preset = parsePreset(losslessJson(await file.text()));
                    store([{ ...preset, id: crypto.randomUUID() }, ...items]);
                    setMessage(`« ${preset.name} » importé.`);
                  } catch (error) {
                    setError(String(error));
                  }
                }}
              />
            </label>
          </div>
          {(message || undo) && (
            <div className="preset-feedback">
              <span role="status">{message}</span>
              {undo && (
                <button
                  onClick={() =>
                    action(() => {
                      store([undo, ...items]);
                      setUndo(null);
                      setMessage("Preset restauré.");
                    })
                  }
                >
                  <RotateCcw size={16} /> Annuler la suppression
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {creating && open && (
        <Modal
          title="Nouveau preset"
          className="new-preset-dialog"
          onClose={() => {
            if (!saveLock.current) setCreating(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="new-preset-preview">
              {image ? (
                <Picture
                  small
                  path={image.path}
                  source={image.url}
                  alt=""
                  thumbnail
                />
              ) : (
                <Bookmark size={24} />
              )}
              <span>
                <strong>
                  {shortName(settings.model) || "Réglages actuels"}
                </strong>
                <small>
                  {settings.width} × {settings.height} · {settings.steps} steps
                  · {settings.loras.length} LoRA
                </small>
              </span>
            </div>
            <label>
              Titre du preset
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Portrait doux, paysage cinématique…"
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div className="row">
              <button
                type="button"
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Annuler
              </button>
              <button
                className="primary"
                type="submit"
                disabled={saving || !name.trim()}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
