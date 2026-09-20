import { appendBlock, checkPrompts } from "./promptLibrary";
import { useState, useMemo } from "react";
import {
  Plus,
  X,
  ArrowLeftRight,
  Dices,
  ChevronDown,
  Copy,
  History,
  AlertCircle,
} from "lucide-react";
import { choices, type ObjectInfo } from "./api";
import { type Settings } from "./workflow";
import { ModelPicker, shortName } from "./components";
import { Modal } from "./Modal";
import { StudioModel, StudioLora } from "./StudioModels";
import PromptEditor from "./PromptEditor";
export function NumberField({
  label,
  caption,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  caption?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      <span>{caption ?? label}</span>
      <input
        aria-label={label}
        type="number"
        inputMode={step < 1 ? "decimal" : "numeric"}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const list = options.some((o) => o.value === value)
    ? options
    : [{ value, label: `${value || "Aucun"} · indisponible` }, ...options];
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {list.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export const samplerLabel = (s: string) =>
  ({
    euler_ancestral: "Euler Ancestral",
    euler: "Euler",
    dpmpp_2m: "DPM++ 2M",
    dpmpp_2m_sde: "DPM++ 2M SDE",
    dpmpp_sde: "DPM++ SDE",
    dpm_2: "DPM2",
    uni_pc: "UniPC",
  })[s] ?? s.replace(/_/g, " ");
export default function SettingsPanel({
  settings: s,
  onChange,
  info,
  lastSeed,
  onGlossary,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  info: ObjectInfo;
  lastSeed: string;
  onGlossary: () => void;
}) {
  const [editor, setEditor] = useState<"positive" | "negative" | null>(null);
  const [tool, setTool] = useState<
    "history" | "blocks" | "check" | undefined
  >();
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [modelRevision, setModelRevision] = useState(0);
  const issues = useMemo(() => checkPrompts(s), [s.positive, s.negative]);
  const openEditor = (
    side: "positive" | "negative",
    nextTool?: "history" | "blocks" | "check",
  ) => {
    setTool(nextTool);
    setEditor(side);
  };
  const [picker, setPicker] = useState<"checkpoints" | "loras" | null>(null);
  const [presets, setPresets] = useState<{ width: number; height: number }[]>(
    () => {
      try {
        return JSON.parse(localStorage.getItem("size-presets") ?? "[]");
      } catch {
        return [];
      }
    },
  );
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...s, [key]: value });
  const models = choices(info, "CheckpointLoaderSimple", "ckpt_name"),
    loras = choices(info, "LoraLoader", "lora_name");
  const options = (node: string, field: string, label = (v: string) => v) =>
    choices(info, node, field).map((value) => ({ value, label: label(value) }));
  const upscalers = options("UpscaleModelLoader", "model_name", shortName).map(
    (v) => ({ ...v, value: "model:" + v.value, label: v.label + " · modèle" }),
  );
  const addPreset = () => {
    if (
      ![s.width, s.height].every(
        (n) => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 8 === 0,
      )
    )
      return;
    const next = [
      ...presets.filter((p) => p.width !== s.width || p.height !== s.height),
      { width: s.width, height: s.height },
    ].slice(-10);
    setPresets(next);
    localStorage.setItem("size-presets", JSON.stringify(next));
  };
  return (
    <>
      <div className="studio-fields">
        <StudioModel
          name={s.model}
          refreshKey={modelRevision}
          onBrowse={() => setPicker("checkpoints")}
        />
        <section
          id="studio-loras"
          tabIndex={-1}
          className="studio-loras"
          aria-label="LoRAs actifs"
        >
          <div className="studio-section-heading">
            <h2>LoRAs actifs · {s.loras.length}</h2>
            <button
              className="inline-action"
              aria-label="LoRA / LyCORIS"
              onClick={() => setPicker("loras")}
            >
              + Ajouter un LoRA
            </button>
          </div>
          {s.loras.map((l, i) => (
            <StudioLora
              key={`${l.name}-${i}`}
              name={l.name}
              strength={l.strength}
              index={i}
              onChange={(v) =>
                change(
                  "loras",
                  s.loras.map((old, n) =>
                    n === i ? { ...old, strength: v } : old,
                  ),
                )
              }
              onRemove={() =>
                change(
                  "loras",
                  s.loras.filter((_, n) => n !== i),
                )
              }
              onTrigger={(tag) =>
                change("positive", appendBlock(s.positive, tag))
              }
            />
          ))}
          {!s.loras.length && (
            <p className="hint">
              Ajoutez un style ou un concept depuis votre PC.
            </p>
          )}
        </section>
        <section
          id="studio-prompts"
          tabIndex={-1}
          className="studio-prompts"
          aria-label="Prompts"
        >
          <div className="studio-section-heading">
            <h2>Les mots font l’image</h2>
            <button
              className="inline-action"
              onClick={() => openEditor("positive", "history")}
            >
              <History size={13} /> Historique
            </button>
          </div>
          <button
            className="prompt-entry prompt-launch positive-entry"
            aria-label="Votre idée"
            onClick={() => openEditor("positive")}
          >
            <small>POSITIF</small>
            <span>{s.positive || "Une scène, une lumière, une émotion…"}</span>
          </button>
          <div className="prompt-shortcuts">
            <button onClick={() => openEditor("positive", "blocks")}>
              + Bloc réutilisable
            </button>
            <button onClick={onGlossary}>Ouvrir le glossaire</button>
          </div>
          <button
            className="prompt-entry prompt-launch negative-entry"
            aria-label="Prompt négatif"
            onClick={() => openEditor("negative")}
          >
            <small>NÉGATIF</small>
            <span>{s.negative || "Ce que vous préférez éviter…"}</span>
          </button>
          {issues.length > 0 && (
            <button
              className="prompt-conflict"
              onClick={() => openEditor("positive", "check")}
            >
              <AlertCircle size={16} />
              <span>
                {issues[0]}
                {issues.length > 1 ? ` (+${issues.length - 1})` : ""}
              </span>
            </button>
          )}
        </section>
        <section
          id="studio-generation"
          tabIndex={-1}
          className="studio-generation"
          aria-label="Réglages de génération"
        >
          <div className="studio-section-heading">
            <h2>Réglages de génération</h2>
          </div>
          <div className="inference-row">
            <div className="field-tile dimensions-tile">
              <span>DIMENSIONS</span>
              <div>
                <input
                  type="number"
                  aria-label="Largeur"
                  min={64}
                  max={4096}
                  step={8}
                  value={Number.isFinite(s.width) ? s.width : ""}
                  onChange={(e) =>
                    change(
                      "width",
                      e.target.value === "" ? NaN : Number(e.target.value),
                    )
                  }
                />
                <span>×</span>
                <input
                  type="number"
                  aria-label="Hauteur"
                  min={64}
                  max={4096}
                  step={8}
                  value={Number.isFinite(s.height) ? s.height : ""}
                  onChange={(e) =>
                    change(
                      "height",
                      e.target.value === "" ? NaN : Number(e.target.value),
                    )
                  }
                />
                <button
                  aria-label="Formats et dimensions"
                  onClick={() => setFormatsOpen(true)}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
            </div>
            <label className="field-tile seed-tile">
              <span>
                SEED{" "}
                <button
                  type="button"
                  aria-label="Seed aléatoire"
                  onClick={() => change("seed", "")}
                >
                  <Dices size={13} />
                </button>
              </span>
              <input
                aria-label="Seed"
                inputMode="numeric"
                value={s.seed}
                placeholder="−1 · aléatoire"
                onChange={(e) => change("seed", e.target.value)}
              />
            </label>
          </div>
          <div className="inference-row three-fields">
            <NumberField
              label="Steps"
              value={s.steps}
              min={1}
              max={150}
              onChange={(v) => change("steps", v)}
            />
            <NumberField
              label="CFG Scale"
              value={s.cfg}
              min={0}
              max={30}
              step={0.1}
              onChange={(v) => change("cfg", v)}
            />
            <NumberField
              label="Batch size · images par lot"
              caption="Lot"
              value={s.batch}
              min={1}
              max={8}
              onChange={(v) => change("batch", v)}
            />
          </div>
          <div className="inference-row">
            <SelectField
              label="Sampler"
              value={s.sampler}
              options={options("KSampler", "sampler_name", samplerLabel)}
              onChange={(v) => change("sampler", v)}
            />
            <SelectField
              label="Scheduler"
              value={s.scheduler}
              options={options(
                "KSampler",
                "scheduler",
                (v) => v[0].toUpperCase() + v.slice(1),
              )}
              onChange={(v) => change("scheduler", v)}
            />
          </div>
          <details className="advanced-inference">
            <summary>Lots, VAE et Clip skip</summary>

            <div className="field-grid">
              <SelectField
                label="VAE"
                value={s.vae}
                options={[
                  { value: "", label: "Inclus dans le modèle" },
                  ...options("VAELoader", "vae_name", shortName),
                ]}
                onChange={(v) => change("vae", v)}
              />
              <NumberField
                label="Clip skip"
                value={s.clipSkip}
                min={1}
                max={24}
                onChange={(v) => change("clipSkip", v)}
              />
            </div>

            <NumberField
              label="Batches · nombre de lots"
              value={s.batches}
              min={1}
              max={20}
              onChange={(v) => change("batches", v)}
            />
            {lastSeed && (
              <button
                className="inline-action"
                onClick={() => change("seed", lastSeed)}
              >
                <Copy size={13} /> Reprendre la dernière seed : {lastSeed}
              </button>
            )}
            <p className="hint">
              {s.batch * s.batches || 0} images demandées. Une seed fixe
              augmente de 1 entre les lots.
            </p>
          </details>
          <details className="hires-options">
            <summary>
              <span>
                Hires Fix & upscale
                <small>
                  {s.hires.enabled ? `Hires ×${s.hires.scale} · ` : ""}
                  {s.upscale.enabled
                    ? shortName(s.upscale.method)
                    : "Agrandir et affiner les détails"}
                </small>
              </span>
              <ChevronDown size={18} />
            </summary>
            <div className="addon">
              <label className="switch-row">
                <span>
                  <strong>Hires Fix</strong>
                  <small>Agrandir puis affiner les détails</small>
                </span>
                <input
                  role="switch"
                  aria-label="Activer Hires Fix"
                  type="checkbox"
                  checked={s.hires.enabled}
                  onChange={(e) =>
                    change("hires", { ...s.hires, enabled: e.target.checked })
                  }
                />
              </label>
              {s.hires.enabled && (
                <div className="addon-fields">
                  <SelectField
                    label="Upscaler Hires Fix"
                    value={s.hires.method}
                    options={[
                      ...options("LatentUpscale", "upscale_method", (v) =>
                        v === "nearest-exact"
                          ? "Nearest Exact · latent"
                          : v + " · latent",
                      ),
                      ...upscalers,
                    ]}
                    onChange={(v) => change("hires", { ...s.hires, method: v })}
                  />
                  <div className="field-grid">
                    <NumberField
                      label="Facteur Hires Fix"
                      value={s.hires.scale}
                      min={1}
                      max={4}
                      step={0.05}
                      onChange={(v) =>
                        change("hires", { ...s.hires, scale: v })
                      }
                    />
                    <NumberField
                      label="Steps Hires Fix"
                      value={s.hires.steps}
                      min={1}
                      max={150}
                      onChange={(v) =>
                        change("hires", { ...s.hires, steps: v })
                      }
                    />
                    <NumberField
                      label="Denoising strength"
                      value={s.hires.denoise}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) =>
                        change("hires", { ...s.hires, denoise: v })
                      }
                    />
                  </div>
                  <p className="hint">
                    Les LoRA, le VAE et le Clip skip choisis s’appliquent aux
                    deux passes.
                  </p>
                </div>
              )}
            </div>
            <div className="addon">
              <label className="switch-row">
                <span>
                  <strong>Upscaler</strong>
                  <small>Agrandissement de l’image finale</small>
                </span>
                <input
                  role="switch"
                  aria-label="Activer Upscaler"
                  type="checkbox"
                  checked={s.upscale.enabled}
                  onChange={(e) =>
                    change("upscale", {
                      ...s.upscale,
                      enabled: e.target.checked,
                    })
                  }
                />
              </label>
              {s.upscale.enabled && (
                <div className="addon-fields field-grid">
                  <SelectField
                    label="Upscaler final"
                    value={s.upscale.method}
                    options={[
                      ...options("ImageScaleBy", "upscale_method", (v) =>
                        v === "nearest-exact" ? "Nearest Exact" : v,
                      ),
                      ...upscalers,
                    ]}
                    onChange={(v) =>
                      change("upscale", { ...s.upscale, method: v })
                    }
                  />
                  <NumberField
                    label="Facteur Upscaler"
                    value={s.upscale.scale}
                    min={1}
                    max={4}
                    step={0.05}
                    onChange={(v) =>
                      change("upscale", { ...s.upscale, scale: v })
                    }
                  />
                </div>
              )}
            </div>
            {(s.hires.enabled || s.upscale.enabled) && (
              <p className="hint">
                Sortie estimée :{" "}
                {Math.round(
                  (s.hires.enabled
                    ? Math.round((s.width * s.hires.scale) / 8) * 8
                    : s.width) * (s.upscale.enabled ? s.upscale.scale : 1),
                )}{" "}
                ×{" "}
                {Math.round(
                  (s.hires.enabled
                    ? Math.round((s.height * s.hires.scale) / 8) * 8
                    : s.height) * (s.upscale.enabled ? s.upscale.scale : 1),
                )}{" "}
                px. Les grands formats consomment davantage de VRAM.
              </p>
            )}
          </details>
        </section>
      </div>
      {formatsOpen && (
        <Modal
          title="Formats et dimensions"
          onClose={() => setFormatsOpen(false)}
        >
          <p className="hint">
            Dimensions libres de 64 à 4 096 pixels, par multiples de 8.
          </p>
          <button
            onClick={() => onChange({ ...s, width: s.height, height: s.width })}
          >
            <ArrowLeftRight size={16} /> Inverser largeur et hauteur
          </button>
          <div className="size-presets">
            {[
              { width: 1024, height: 1024, label: "Carré" },
              { width: 832, height: 1216, label: "Portrait" },
              { width: 1216, height: 832, label: "Paysage" },
              { width: 512, height: 512, label: "SD 1.5" },
            ].map((p) => (
              <button
                key={p.label}
                className={
                  s.width === p.width && s.height === p.height ? "selected" : ""
                }
                onClick={() =>
                  onChange({ ...s, width: p.width, height: p.height })
                }
              >
                <span
                  className="ratio-shape"
                  style={{
                    width: 23 * Math.min(1, p.width / p.height),
                    height: 23 * Math.min(1, p.height / p.width),
                  }}
                />
                <strong>{p.label}</strong>
                <small>
                  {p.width} × {p.height}
                </small>
              </button>
            ))}
          </div>
          <details>
            <summary>Mes formats personnalisés</summary>
            <div className="row">
              {presets.map((p) => (
                <div className="preset-chip" key={`${p.width}x${p.height}`}>
                  <button onClick={() => onChange({ ...s, ...p })}>
                    {p.width} × {p.height}
                  </button>
                  <button
                    aria-label={`Supprimer le format ${p.width} par ${p.height}`}
                    onClick={() => {
                      const next = presets.filter((v) => v !== p);
                      setPresets(next);
                      localStorage.setItem(
                        "size-presets",
                        JSON.stringify(next),
                      );
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addPreset}>
              <Plus size={16} /> Mémoriser ce format
            </button>
          </details>
        </Modal>
      )}
      {editor && (
        <PromptEditor
          initialTab={editor}
          initialTool={tool}
          values={{ positive: s.positive, negative: s.negative }}
          onChange={(v) => onChange({ ...s, ...v })}
          onClose={() => setEditor(null)}
        />
      )}
      {picker && (
        <ModelPicker
          onTriggers={(words) =>
            change("positive", appendBlock(s.positive, words.join(", ")))
          }
          title={
            picker === "checkpoints"
              ? "Choisir un modèle"
              : "Ajouter un LoRA / LyCORIS"
          }
          kind={picker}
          names={picker === "checkpoints" ? models : loras}
          value={picker === "checkpoints" ? s.model : ""}
          onClose={() => {
            setPicker(null);
            setModelRevision((v) => v + 1);
          }}
          onSelect={(name) =>
            picker === "checkpoints"
              ? change("model", name)
              : change("loras", [...s.loras, { name, strength: 1 }])
          }
        />
      )}
    </>
  );
}
