import AppUpdater from "./AppUpdater";
import { modelChoices } from "./api";
import ModelImports, { useModelImports } from "./ModelImports";
import { useLocale, t as tr, locale } from "./i18n";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import {
  Download,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Images,
  BookOpen,
  RefreshCw,
  X,
  Monitor,
  LoaderCircle,
  FolderOpen,
  Heart,
  Search,
  ArrowUpRight,
  Trash2,
  RotateCcw,
  Upload,
  ChevronDown,
} from "lucide-react";
import {
  api,
  native,
  galleryPath,
  choices,
  type Gallery,
  type GalleryItem,
  type ObjectInfo,
  type Stats,
  type Queue,
  type Workflow,
} from "./api";
import {
  buildWorkflow,
  defaults,
  normalizeSettings,
  parseWorkflow,
  checkWorkflow,
  MAX_SEED,
  seedValue,
  type Settings,
} from "./workflow";
import { importImage, resolveImport, type Imported } from "./metadata";
import { Picture, clearImageCache, type ViewItem } from "./components";
import CollapsibleCard from "./CollapsibleCard";
import SettingsPanel from "./SettingsPanel";
import StudioNav from "./StudioNav";
import mochiHeader from "../assets/brand/expressions/open.webp";
import Connections from "./Connections";
const Glossary = lazy(() => import("./Glossary"));
const Viewer = lazy(() => import("./Viewer"));
import { rememberPrompt } from "./promptLibrary";
import Presets from "./Presets";
import { usePageNavigation, pages, type Page } from "./PageNavigation";
import ConnectionStatus from "./ConnectionStatus";
import GalleryGrid from "./GalleryGrid";

import Welcome from "./Welcome";
import Onboarding from "./Onboarding";
import Toast from "./Toast";

import {
  readStored as stored,
  writeStored,
  removeStored,
} from "./sessionStorage";
import { useSettingsPersistence } from "./useSettingsPersistence";
import { useGenerationSession, clientId } from "./useGenerationSession";

const bytesOf = (url: string) =>
  Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) =>
    c.charCodeAt(0),
  );
const dataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
type TrashItem = {
  id: string;
  root: number;
  name: string;
  relative: string;
  deleted: number;
};
type ViewerState = { items: ViewItem[]; index: number; fromGallery: boolean };
const uniqueImages = (items: GalleryItem[]) => [
  ...new Map(
    items.map((item) => [`${item.root}:${item.relative}`, item]),
  ).values(),
];
const emptyGallery: Gallery = { items: [], total: 0, warnings: [] };
export default function App() {
  useLocale();
  const [setupStep, setSetupStep] = useState(() =>
    Math.max(0, Math.min(4, Number(stored("onboarding-step", 0)) || 0)),
  );
  const [setupDone, setSetupDone] = useState(
    () => stored<boolean>("onboarding-done", false) === true,
  );
  const [setupOpen, setSetupOpen] = useState(
    () => stored<boolean>("onboarding-done", false) !== true,
  );
  useEffect(() => {
    const reopen = () => {
      setSetupStep(0);
      writeStored("onboarding-step", 0);
      setSetupOpen(true);
    };
    window.addEventListener("mochi-setup", reopen);
    return () => window.removeEventListener("mochi-setup", reopen);
  }, []);
  const followResult = useRef(false);
  useEffect(() => {
    const stop = () => {
      followResult.current = false;
    };
    window.addEventListener("pointerdown", stop, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
    };
  }, []);

  const [quickMenu, setQuickMenu] = useState(
    () => stored<boolean>("quick-menu", true) !== false,
  );
  const [leftHanded, setLeftHanded] = useState(
    () => stored<boolean>("left-handed", false) === true,
  );
  const { tab, setTab, setInitialTab, handlers, trackRef } =
    usePageNavigation();
  const [server, setServer] = useState(""),
    [online, setOnline] = useState(false),
    [stats, setStats] = useState<Stats | null>(null),
    [info, setInfo] = useState<ObjectInfo>({});
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings(stored("settings", defaults)),
  );
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [lastSeed, setLastSeed] = useState("");
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [columns, setColumns] = useState(() => {
    const n = stored<number>("gallery-columns", 2);
    return [2, 3, 4].includes(n) ? n : 2;
  });
  const [gallery, setGallery] = useState<Gallery>(emptyGallery),
    [galleryBusy, setGalleryBusy] = useState(false),
    [search, setSearch] = useState(""),
    [root, setRoot] = useState(""),
    [filter, setFilter] = useState<"all" | "favorites" | "trash">("all"),
    [roots, setRoots] = useState<{ id: number; name: string }[]>([]),
    [trash, setTrash] = useState<TrashItem[]>([]),
    [undo, setUndo] = useState<TrashItem | null>(null);
  const [custom, setCustom] = useState<Workflow | null>(null),
    [customText, setCustomText] = useState(""),
    [mode, setMode] = useState<"simple" | "workflow">("simple"),
    [imported, setImported] = useState<Imported | null>(null);
  const submitLock = useRef(false),
    generation = useRef(0),
    galleryRequest = useRef(0),
    hydrationRequest = useRef(0),
    viewerSession = useRef(0);
  const [showConnection, setShowConnection] = useState(false);
  const [showImports, setShowImports] = useState(false);
  const modelImports = useModelImports(server, setInfo);
  useEffect(() => setShowImports(false), [server]);
  const [epoch, setEpoch] = useState(0);
  const [presetRequest, setPresetRequest] = useState<{
    id: number;
    create?: boolean;
  }>({ id: 0 });

  const {
    queue,
    jobs,
    jobsRef,
    track,
    cursor,
    progress,
    setProgress,
    phase,
    setPhase,
    preview,
    setPreview,
    results,
    setResults,
    reset: resetGeneration,
  } = useGenerationSession(server, epoch, generation, setOnline, setError);
  const [glossaryVisited, setGlossaryVisited] = useState(false);
  useEffect(() => {
    if (tab === "glossary") setGlossaryVisited(true);
  }, [tab]);
  useSettingsPersistence(settings, server);
  const hydrate = useCallback(
    async (url: string, initial = false, version = generation.current) => {
      const request = ++hydrationRequest.current;
      const [s, i, b] = await Promise.all([
        api<Stats>("/api/system_stats"),
        api<ObjectInfo>("/api/object_info"),
        api<{ version: number; roots: { id: number; name: string }[] }>(
          "/bridge/info",
        ),
      ]);
      if (
        version !== generation.current ||
        request !== hydrationRequest.current
      )
        return;
      if (b.version < 2)
        throw new Error(
          tr("Mettez à jour le compagnon PC avec le lanceur de cette version."),
        );
      const models = modelChoices(i);
      const saved = normalizeSettings(
        stored("settings:" + url, stored("settings", defaults)),
      );
      setSettings({
        ...saved,
        model: models.includes(saved.model) ? saved.model : (models[0] ?? ""),
        sampler: choices(i, "KSampler", "sampler_name").includes(saved.sampler)
          ? saved.sampler
          : (choices(i, "KSampler", "sampler_name")[0] ?? defaults.sampler),
      });
      setStats(s);
      setInfo(i);
      setRoots(b.roots);
      setOnline(true);
      setServer(url);
      if (initial) setInitialTab("create");
      else setTab("create");
      const old = stored<{ url: string; id: string } | null>("active", null);
      track(stored("tasks:" + url, old?.url === url ? [old.id] : []), url);
      setResults(stored("results:" + url, []));
      setLastSeed(stored("seed:" + url, ""));
    },
    [track],
  );
  useEffect(() => {
    let live = true;
    const version = generation.current;
    native<string | null>("restore")
      .then(async (url) => {
        if (url && live && version === generation.current) {
          try {
            await hydrate(url, true, version);
          } catch (e) {
            if (live && version === generation.current) setError(String(e));
          }
        }
      })
      .catch((e) => {
        if (live && version === generation.current) setError(String(e));
      });
    return () => {
      live = false;
      hydrationRequest.current++;
    };
  }, [hydrate]);
  function resetSession() {
    setPresetRequest({ id: 0 });
    generation.current++;
    setEpoch(generation.current);
    galleryRequest.current++;
    hydrationRequest.current++;
    viewerSession.current++;
    resetGeneration();
    setServer("");
    setOnline(false);
    setInfo({});
    setStats(null);
    setRoots([]);
    setRoot("");
    setGallery(emptyGallery);
    setTrash([]);
    setViewer(null);
    setResults([]);
    setPreview("");
    setImported(null);
    setCustom(null);
    setCustomText("");
    setMode("simple");
    setProgress(0);
    setPhase(tr("Prêt à créer"));
    clearImageCache();
    setUndo(null);
  }
  async function connect(id: string) {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    resetSession();
    const version = generation.current;
    try {
      const url = await native<string>("activate_profile", { id });
      if (version !== generation.current) return;
      await hydrate(url, false, version);
      if (version !== generation.current) return;
      setNotice(tr("Connexion chiffrée établie avec votre PC."));
    } catch (e) {
      if (version === generation.current) setError(String(e));
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  async function disconnect(already = false) {
    if (!already) await native("disconnect");
    resetSession();
    setTab("connect");
  }
  async function generate() {
    followResult.current = true;
    if (submitLock.current || !online) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const version = generation.current;
    try {
      const batchCount = mode === "workflow" ? 1 : settings.batches;
      if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 20)
        throw new Error(tr("Nombre de lots : 1 à 20."));
      let profile: { architecture: string; diffusion?: boolean } | undefined;
      if (mode !== "workflow") {
        const bridge = await api<{ modelProfiles?: boolean }>("/bridge/info");
        const diffusion = !choices(info, "CheckpointLoaderSimple", "ckpt_name").includes(settings.model);
        if (bridge.modelProfiles) {
          profile = { ...await api<{ architecture: string }>("/bridge/model-profile?" + new URLSearchParams({kind: diffusion ? "diffusion_models" : "checkpoints", name: settings.model})), diffusion };
        } else if (diffusion) throw new Error(tr("Mettez à jour Mochi Studio pour utiliser les modèles de diffusion."));
      }
      const builds: { workflow: Workflow; settings?: Settings }[] = [];
      for (let n = 0; n < batchCount; n++) {
        if (mode === "workflow") {
          if (!custom)
            throw new Error(tr("Importez et validez un workflow API."));
          builds.push({ workflow: custom });
          continue;
        }
        if (
          !modelChoices(info).includes(
            settings.model,
          )
        )
          throw new Error(
            tr(
              "Le modèle importé est absent de ce PC. Choisissez un modèle disponible.",
            ),
          );
        const s = {
          ...settings,
          seed: settings.seed.trim()
            ? String(
                (BigInt(seedValue(settings.seed)) + BigInt(n)) %
                  (MAX_SEED + 1n),
              )
            : "",
        };
        const built = buildWorkflow(s, profile, info);
        s.seed = String(built.seed);
        builds.push({ workflow: built.workflow, settings: s });
      }
      builds.forEach((b) => checkWorkflow(b.workflow, info));
      try {
        rememberPrompt(settings);
      } catch (e) {
        setNotice(String(e));
      }
      await api(`/bridge/events?clientId=${clientId}&after=${cursor.current}`);
      if (version !== generation.current) return;
      setResults([]);
      removeStored("results:" + server);
      setPreview("");
      setProgress(0);
      setPhase(tr("En attente du GPU"));
      document
        .getElementById("studio-render")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      for (const b of builds) {
        if (version !== generation.current) break;
        const response = await api<{
          prompt_id?: string;
          error?: unknown;
          node_errors?: unknown;
        }>("/api/prompt", {
          prompt: b.workflow,
          client_id: clientId,
          extra_data: {
            extra_pnginfo: b.settings
              ? { comfy_pocket: { version: 2, settings: b.settings } }
              : {},
          },
        });
        if (version !== generation.current) break;
        if (!response.prompt_id)
          throw new Error(
            JSON.stringify(response.error ?? response.node_errors ?? response),
          );
        track([...jobsRef.current, response.prompt_id], server);
        if (b.settings) {
          setLastSeed(b.settings.seed);
          writeStored("seed:" + server, b.settings.seed);
        }
      }
    } catch (e) {
      if (version !== generation.current) return;
      setError(
        String(e) +
          (jobsRef.current.length
            ? tr(" Les lots déjà envoyés continuent.")
            : ""),
      );
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  async function cancel() {
    const version = generation.current,
      owned = new Set(jobsRef.current);
    setError("");
    try {
      const q = await api<Queue>("/api/queue");
      if (version !== generation.current) return;
      const pending = q.queue_pending
        .filter((j) => owned.has(j[1]))
        .map((j) => j[1]);
      if (pending.length) await api("/api/queue", { delete: pending });
      if (version !== generation.current) return;
      const running = q.queue_running.find((j) => owned.has(j[1]));
      if (running) await api("/api/interrupt", { prompt_id: running[1] });
      if (version !== generation.current) return;
      track(
        jobsRef.current.filter((id) => !pending.includes(id)),
        server,
      );
      setPhase(tr("Annulation demandée"));
      setPreview("");
    } catch (e) {
      if (version === generation.current) setError(String(e));
    }
  }
  async function loadGallery(append = false): Promise<GalleryItem[]> {
    if (!server) return [];
    const request = ++galleryRequest.current;
    setGalleryBusy(true);
    try {
      if (filter === "trash") {
        const data = await api<{ items: TrashItem[] }>("/bridge/trash");
        if (request === galleryRequest.current) setTrash(data.items);
        return [];
      }
      const params = new URLSearchParams({
        q: search,
        offset: String(append ? gallery.items.length : 0),
        limit: "40",
      });
      if (root) params.set("root", root);
      if (filter === "favorites") params.set("favorite", "true");
      const data = await api<Gallery>("/bridge/gallery?" + params);
      if (request !== galleryRequest.current) return [];
      setGallery((old) => ({
        ...data,
        items: append
          ? uniqueImages([...old.items, ...data.items])
          : data.items,
      }));
      return data.items;
    } catch (e) {
      if (request === galleryRequest.current) setError(String(e));
      throw e;
    } finally {
      if (request === galleryRequest.current) setGalleryBusy(false);
    }
  }
  useEffect(() => {
    if (!server) return;
    const t = setTimeout(() => void loadGallery().catch(() => {}), 200);
    return () => {
      clearTimeout(t);
      galleryRequest.current++;
    };
  }, [server, search, root, filter]);
  useEffect(() => {
    // Re-entering a mounted gallery refreshes its contents without clearing the grid.
    if (tab === "gallery" && server) void loadGallery().catch(() => {});
  }, [tab]);
  const same = (a: GalleryItem | undefined, b: GalleryItem) =>
    a?.root === b.root && a.relative === b.relative;
  async function resultSource(item: ViewItem): Promise<GalleryItem> {
    if (item.gallery) return item.gallery;
    const url = new URL(item.path, "https://local");
    if (
      url.pathname !== "/api/view" ||
      url.searchParams.get("type") !== "output"
    )
      throw new Error(
        tr("Cette image ne se trouve pas dans le dossier de résultats."),
      );
    const relative = [
      url.searchParams.get("subfolder"),
      url.searchParams.get("filename"),
    ]
      .filter(Boolean)
      .join("/");
    // The companion's first root is the ComfyUI output directory (--output).
    const page = await api<Gallery>(
      `/bridge/gallery?root=0&limit=100&q=${encodeURIComponent(relative)}`,
    );
    const match = page.items.find(
      (i) => i.root === 0 && i.relative.replace(/\\/g, "/") === relative,
    );
    if (!match)
      throw new Error(
        tr(
          "Image introuvable dans la collection. Réessayez dans quelques instants.",
        ),
      );
    return match;
  }
  function dismissResult(item: ViewItem) {
    setResults((old) => {
      const next = old.filter((i) => i.path !== item.path);
      writeStored("results:" + server, next);
      return next;
    });
  }
  const [resultBusy, setResultBusy] = useState(false);
  const resultLock = useRef(false);
  async function resultAction(kind: "favorite" | "trash", item: ViewItem) {
    if (resultLock.current) return;
    resultLock.current = true;
    setResultBusy(true);
    const revision = generation.current;
    try {
      const resolved = { ...item, gallery: await resultSource(item) };
      if (revision !== generation.current) return;
      if (kind === "favorite")
        await favorite(resolved, !resolved.gallery.favorite);
      else {
        await deleteImage(resolved);
        if (revision === generation.current) dismissResult(item);
      }
    } catch (e) {
      if (revision === generation.current) setError(String(e));
    } finally {
      resultLock.current = false;
      setResultBusy(false);
    }
  }
  async function favorite(item: ViewItem, value: boolean) {
    if (!item.gallery) return;
    const version = generation.current;
    const g = item.gallery;
    await api("/bridge/favorite", {
      root: g.root,
      relative: g.relative,
      favorite: value,
    });
    if (version !== generation.current) return;
    setResults((old) => {
      const next = old.map((i) =>
        i.path === item.path || same(i.gallery, g)
          ? { ...i, gallery: { ...g, favorite: value } }
          : i,
      );
      writeStored("results:" + server, next);
      return next;
    });
    galleryRequest.current++;
    setGalleryBusy(false);
    setGallery((old) => {
      const remove =
        filter === "favorites" && !value && old.items.some((i) => same(i, g));
      return {
        ...old,
        total: Math.max(0, old.total - (remove ? 1 : 0)),
        items: remove
          ? old.items.filter((i) => !same(i, g))
          : old.items.map((i) => (same(i, g) ? { ...i, favorite: value } : i)),
      };
    });
    setViewer(
      (old) =>
        old && {
          ...old,
          items: old.items.map((i) =>
            same(i.gallery, g)
              ? { ...i, gallery: { ...g, favorite: value } }
              : i,
          ),
        },
    );
  }
  async function deleteImage(item: ViewItem, silent = false) {
    if (!item.gallery) return;
    const g = item.gallery;
    const version = generation.current;
    const deleted = await api<TrashItem>("/bridge/trash", {
      root: g.root,
      relative: g.relative,
    });
    if (version !== generation.current) return;
    setResults((old) => {
      const next = old.filter(
        (i) => i.path !== item.path && !same(i.gallery, g),
      );
      writeStored("results:" + server, next);
      return next;
    });
    galleryRequest.current++;
    setGalleryBusy(false);
    if (!silent) {
      setUndo(deleted);
      setNotice(tr("Image déplacée dans la corbeille du PC."));
    }
    setGallery((old) => ({
      ...old,
      total: Math.max(
        0,
        old.total - (old.items.some((i) => same(i, g)) ? 1 : 0),
      ),
      items: old.items.filter((i) => !same(i, g)),
    }));
    setViewer((old) => {
      if (!old) return null;
      const items = old.items.filter((i) => !same(i.gallery, g));
      return items.length
        ? { ...old, items, index: Math.min(old.index, items.length - 1) }
        : null;
    });
  }
  async function restore(item: TrashItem) {
    const version = generation.current;
    try {
      await api("/bridge/restore", { root: item.root, id: item.id });
      if (version !== generation.current) return;
      setUndo(null);
      setNotice(tr("Image restaurée à son emplacement d’origine."));
      await loadGallery();
    } catch (e) {
      if (version === generation.current) setError(String(e));
    }
  }
  async function reuse(
    item: ViewItem,
    url: string,
    version = generation.current,
  ) {
    if (version !== generation.current) return;
    const parsed = resolveImport(await importImage(bytesOf(url)), {
      models: modelChoices(info),
      loras: choices(info, "LoraLoader", "lora_name"),
      vaes: choices(info, "VAELoader", "vae_name"),
      samplers: choices(info, "KSampler", "sampler_name"),
      schedulers: choices(info, "KSampler", "scheduler"),
    });
    if (version !== generation.current) return;
    setSettings(normalizeSettings(parsed.settings));
    setImported(parsed);
    setMode("simple");
    setCustom(parsed.workflow ?? null);
    setCustomText(
      parsed.workflow ? JSON.stringify(parsed.workflow, null, 2) : "",
    );
    setResults([{ ...item, url }]);
    setPreview("");
    setViewer(null);
    setTab("create");
    setPhase(tr("Paramètres chargés depuis l’image"));
    setError("");
    setNotice(
      tr("Les paramètres et la seed reconnus sont prêts à être réutilisés."),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function importFile(
    file: File | undefined,
    type: "image" | "workflow",
  ) {
    if (!file) return;
    const version = generation.current;
    setError("");
    try {
      if (file.size > (type === "image" ? 64 : 10) * 1024 * 1024)
        throw new Error(tr("Fichier trop volumineux."));
      if (type === "image") {
        const url = await dataUrl(file);
        await reuse(
          {
            path: "local:" + file.name + ":" + file.lastModified,
            name: file.name,
            url,
          },
          url,
          version,
        );
      } else {
        const w = parseWorkflow(await file.text());
        if (version !== generation.current) return;
        setCustom(w);
        setCustomText(JSON.stringify(w, null, 2));
        setMode("workflow");
      }
    } catch (e) {
      if (version === generation.current) setError(String(e));
    }
  }
  const device = stats?.devices?.[0];
  const deviceName = (device?.name ?? tr("GPU du PC"))
    .replace(/^cuda:\d+\s*/, "")
    .replace(/\s*:\s*cudaMallocAsync.*$/, "")
    .replace(/^NVIDIA GeForce\s+/, "");
  const views = (items: GalleryItem[]): ViewItem[] =>
    items.map((g) => ({ path: galleryPath(g), name: g.name, gallery: g }));
  const openViewer = (value: ViewerState) => {
    viewerSession.current++;
    setViewer(value);
  };
  const closeViewer = () => {
    viewerSession.current++;
    const from = viewer?.fromGallery;
    setViewer(null);
    if (from) void loadGallery().catch(() => {});
  };
  const notify = useCallback((text: string) => {
    setUndo(null);
    setNotice(text);
  }, []);
  const addTags = useCallback(
    (tags: string[], side: "positive" | "negative") =>
      setSettings((s) => {
        const existing = new Set(s[side].split(",").map((t) => t.trim()));
        const added = tags
          .map((t) => t.replace(/[()]/g, "\\$&"))
          .filter((t) => !existing.has(t));
        return {
          ...s,
          [side]: [s[side].trim().replace(/,\s*$/, ""), ...added]
            .filter(Boolean)
            .join(", "),
        };
      }),
    [],
  );
  const renderPage = (tab: Page, active: boolean) => (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {
              {
                create: tr("Votre imagination,"),
                gallery: tr("Vos petits mondes"),
                glossary: tr("Le mot juste."),
                connect: tr("Paramètres"),
              }[tab]
            }
          </h1>
          <p>
            {
              {
                create: tr("La puissance de votre PC. La liberté du mobile."),
                gallery: tr("Vos créations, autant d’idées à retrouver."),
                glossary: tr("Un glossaire Danbooru pour guider vos idées."),
                connect: tr("Votre ordinateur, vos préférences, votre espace."),
              }[tab]
            }
          </p>
        </div>
        {tab === "gallery" && (
          <button
            aria-label={tr("Actualiser la galerie")}
            disabled={galleryBusy || !server}
            onClick={() => void loadGallery().catch(() => {})}
          >
            <RefreshCw size={20} className={galleryBusy ? "spin" : ""} />
          </button>
        )}
      </div>
      {tab === "glossary" && (active || glossaryVisited) && (
        <Suspense
          fallback={
            <div
              className="section-skeleton"
              aria-label={tr("Ouverture du glossaire")}
            />
          }
        >
          <Glossary onNotice={notify} onAdd={addTags} />
        </Suspense>
      )}
      {tab === "connect" && !setupDone && (
        <button
          className="setup-mobile-resume"
          onClick={() => setSetupOpen(true)}
        >
          {locale() === "en" ? "Resume setup" : "Reprendre la configuration"}
        </button>
      )}
      {tab === "connect" && server && <button className="import-entry secondary" onClick={() => setShowImports(true)}><Download size={19}/>{tr("Installer un modèle depuis un lien")}</button>}
      {tab === "connect" && (
        <Connections
          active={active}
          server={server}
          busy={busy}
          onConnect={connect}
          onDisconnect={disconnect}
          onError={setError}
          quickMenu={quickMenu}
          onQuickMenu={(value) => {
            setQuickMenu(value);
            writeStored("quick-menu", value);
          }}
          leftHanded={leftHanded}
          onHandedness={(value) => {
            setLeftHanded(value);
            if (!writeStored("left-handed", value))
              notify(
                tr(
                  "Ce choix s’applique pour cette session ; l’enregistrement est indisponible.",
                ),
              );
          }}
          stats={stats}
          queue={queue}
          online={online}
          onOpen={(target) => {
            if (target === "trash") {
              setFilter("trash");
              setTab("gallery");
              return;
            }
            setTab("create");
            if (target === "workflow") setMode("workflow");
            if (target === "models") setMode("simple");
            if (target === "presets")
              setPresetRequest((v) => ({ id: v.id + 1, create: false }));
          }}
        />
      )}
      {(tab === "create" || tab === "gallery") && !server && (
        <Welcome
          onConnect={() => setTab("connect")}
          onExplore={() => setTab("glossary")}
        />
      )}
      {tab === "create" && server && (
        <div className="atelier-layout">
          <button
            className="studio-pc"
            aria-label={online ? tr("PC connecté") : tr("PC indisponible")}
            onClick={() => setShowConnection(true)}
          >
            <Monitor size={20} />
            <span>
              <strong>
                {online
                  ? tr("Studio PC · connecté")
                  : tr("Studio PC · indisponible")}
              </strong>
              <small>
                {deviceName}
                {device
                  ? tr(" · {0} Go VRAM libres", [
                      (device.vram_free / 1024 ** 3).toLocaleString(locale(), {
                        maximumFractionDigits: 1,
                      }),
                    ])
                  : ""}
              </small>
            </span>
            <ChevronDown size={16} />
          </button>
          <div
            className="configuration-slot"
            id="studio-configuration"
            tabIndex={-1}
          >
            <Presets
              request={presetRequest}
              image={results[0]}
              settings={settings}
              mode={mode}
              workflow={custom}
              onApply={(p) => {
                setSettings(p.settings);
                setMode(p.mode);
                setCustom(p.workflow);
                setCustomText(
                  p.workflow ? JSON.stringify(p.workflow, null, 2) : "",
                );
                setImported(null);
                setNotice(tr("Preset « {0} » chargé.", [p.name]));
                setError("");
              }}
            />
          </div>
          {imported && (
            <CollapsibleCard
              className="import-summary"
              title={tr("Paramètres importés")}
            >
              <div className="section-heading">
                <strong>
                  {tr("Import ·")} {imported.source}
                </strong>
                <button
                  aria-label={tr("Fermer le détail de l’import")}
                  onClick={() => setImported(null)}
                >
                  <X size={16} />
                </button>
              </div>
              <p>
                {settings.width} × {settings.height} · {settings.steps} steps ·
                Seed {settings.seed || "absente"}
              </p>
              {imported.warnings.length > 0 && (
                <ul>
                  {imported.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {custom && (
                <button
                  className="text-button"
                  onClick={() => setMode("workflow")}
                >
                  {" "}
                  {tr("Ouvrir le workflow API original")}{" "}
                  <ArrowUpRight size={15} />
                </button>
              )}
            </CollapsibleCard>
          )}
          <button className="import-entry secondary" onClick={() => setShowImports(true)}><Download size={19}/>{tr("Installer un modèle depuis un lien")}</button>
          {mode === "simple" ? (
            <div className="settings-grid studio-settings">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                info={info}
                lastSeed={lastSeed}
                onGlossary={() => setTab("glossary")}
                key={epoch}
              />
            </div>
          ) : (
            <CollapsibleCard title="Workflow API">
              <p className="muted">
                {" "}
                {tr(
                  "Conservez les nœuds, modèles et réglages d’un workflow ComfyUI complet. Les champs du mode automatique ne modifient pas ce graphe.",
                )}{" "}
              </p>
              <label className="file-picker">
                <FolderOpen size={19} /> {tr("Importer un workflow API")}{" "}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    void importFile(e.target.files?.[0], "workflow");
                    e.target.value = "";
                  }}
                />
              </label>
              <label>
                Workflow JSON
                <textarea
                  className="code-editor"
                  rows={14}
                  spellCheck={false}
                  value={customText}
                  onChange={(e) => {
                    setCustomText(e.target.value);
                    setCustom(null);
                  }}
                />
              </label>
              <button
                onClick={() => {
                  try {
                    const w = parseWorkflow(customText);
                    checkWorkflow(w, info);
                    setCustom(w);
                    setNotice(tr("Workflow validé sur ce PC."));
                    setError("");
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                {" "}
                {tr("Valider les modifications")}{" "}
              </button>
            </CollapsibleCard>
          )}
          <div className="studio-imports">
            <label className="file-picker">
              <Upload size={18} /> {tr("Paramètres depuis une image")}{" "}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.json,image/png,image/jpeg,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  void importFile(
                    file,
                    file?.name.toLowerCase().endsWith(".json")
                      ? "workflow"
                      : "image",
                  );
                  e.target.value = "";
                }}
              />
            </label>
            <div className="segmented">
              <button
                aria-pressed={mode === "simple"}
                onClick={() => setMode("simple")}
              >
                {" "}
                {tr("Automatique")}{" "}
              </button>
              <button
                aria-pressed={mode === "workflow"}
                onClick={() => setMode("workflow")}
              >
                Workflow API
              </button>
            </div>
            <button
              className="save-preset-shortcut"
              onClick={() =>
                setPresetRequest((v) => ({ id: v.id + 1, create: true }))
              }
            >
              {" "}
              {tr("+ Enregistrer le preset")}{" "}
            </button>
          </div>
          <section
            id="studio-render"
            tabIndex={-1}
            className="render-panel"
            aria-label={tr("Rendu de génération")}
          >
            <div className="studio-section-heading">
              <h2>{tr("Rendu en temps réel")}</h2>
              {jobs.length > 0 && (
                <span className="live-badge">{tr("EN DIRECT")}</span>
              )}
            </div>
            <div
              className={
                results.length || preview ? "output-image" : "output-empty"
              }
            >
              {preview ? (
                <img src={preview} alt={tr("Aperçu de génération en cours")} />
              ) : results[0] ? (
                <Picture
                  onLoad={() => {
                    if (followResult.current && active)
                      requestAnimationFrame(() =>
                        document
                          .getElementById("studio-render")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          }),
                      );
                  }}
                  path={results[0].path}
                  source={results[0].url}
                  alt={results[0].name}
                  onOpen={(url) =>
                    openViewer({
                      items: results.map((r, i) =>
                        i === 0 ? { ...r, url } : r,
                      ),
                      index: 0,
                      fromGallery: false,
                    })
                  }
                  key={results[0].path}
                />
              ) : (
                <>
                  <span className="empty-orbit">
                    <Sparkles size={34} />
                  </span>
                  <h3>{tr("Imaginez la suite.")}</h3>
                  <p>
                    {" "}
                    {tr("Votre prochaine image apparaîtra ici,")} <br />{" "}
                    {tr("avec son aperçu pendant la génération.")}{" "}
                  </p>
                </>
              )}
            </div>
            {!preview && results[0] && (
              <div className="result-actions">
                <button
                  disabled={resultBusy}
                  aria-label={tr("Masquer ce résultat")}
                  onClick={() => dismissResult(results[0])}
                >
                  <X size={18} />
                  <span>{tr("Masquer")}</span>
                </button>
                <button
                  disabled={resultBusy}
                  aria-label={tr("Favori du résultat")}
                  aria-pressed={!!results[0].gallery?.favorite}
                  onClick={() => void resultAction("favorite", results[0])}
                >
                  <Heart
                    size={18}
                    fill={
                      results[0].gallery?.favorite ? "currentColor" : "none"
                    }
                  />
                  <span>{tr("Favori")}</span>
                </button>
                <button
                  disabled={resultBusy}
                  aria-label={tr("Supprimer ce résultat")}
                  onClick={() => void resultAction("trash", results[0])}
                >
                  <Trash2 size={18} />
                  <span>{tr("Corbeille")}</span>
                </button>
              </div>
            )}
            <div className="output-footer">
              <span role="status">
                {tr(phase)}
                {!jobs.length && results.length > 0
                  ? tr(" · {0} image{1}", [
                      results.length,
                      results.length > 1 ? "s" : "",
                    ])
                  : ""}
              </span>
              {jobs.length > 0 && (
                <button className="text-button" onClick={() => void cancel()}>
                  {" "}
                  {tr("Annuler mes lots")}{" "}
                </button>
              )}
            </div>
            {jobs.length > 0 && (
              <progress
                max={100}
                value={progress}
                aria-label={tr("Progression de génération")}
              />
            )}
            {results.length > 1 && (
              <div className="result-strip">
                {results.map((r) => (
                  <Picture
                    small
                    key={r.path}
                    path={r.path}
                    alt={r.name}
                    actionLabel={tr("Afficher le résultat {0}", [r.name])}
                    onOpen={() => {
                      setResults((old) => {
                        const next = [
                          r,
                          ...old.filter((item) => item.path !== r.path),
                        ];
                        writeStored("results:" + server, next);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
            <div className="generate-bar">
              <div>
                <strong>
                  {mode === "simple"
                    ? tr("{0} image(s)", [
                        settings.batch * settings.batches || 0,
                      ])
                    : tr("Workflow personnalisé")}
                </strong>
                <small>
                  {deviceName} · {queue.queue_pending.length}{" "}
                  {tr("en attente")}{" "}
                </small>
              </div>
              <button
                className="primary"
                disabled={busy || !online || jobs.length > 0}
                onClick={() => void generate()}
              >
                {busy || jobs.length ? (
                  <LoaderCircle className="spin" size={19} />
                ) : (
                  <Sparkles size={19} />
                )}
                <span>
                  {jobs.length
                    ? tr("Génération en cours")
                    : tr("Générer l’image")}
                </span>
              </button>
            </div>{" "}
          </section>
        </div>
      )}
      {tab === "gallery" && server && (
        <>
          <div className="gallery-toolbar">
            <label className="search-box">
              <Search size={19} />
              <input
                aria-label={tr("Rechercher dans la galerie")}
                placeholder={tr("Rechercher une image…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  aria-label={tr("Effacer la recherche de galerie")}
                  onClick={() => setSearch("")}
                >
                  <X size={18} />
                </button>
              )}
            </label>
            <label className="root-select">
              <span className="sr-only">{tr("Dossier")}</span>
              <select value={root} onChange={(e) => setRoot(e.target.value)}>
                <option value="">{tr("Tous les dossiers")}</option>
                {roots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="collection-tabs">
            <button
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              <Images size={17} /> {tr("Toutes")}{" "}
            </button>
            <button
              aria-pressed={filter === "favorites"}
              onClick={() => setFilter("favorites")}
            >
              <Heart size={17} /> {tr("Favoris")}{" "}
            </button>
            <button
              aria-pressed={filter === "trash"}
              onClick={() => setFilter("trash")}
            >
              <Trash2 size={17} /> {tr("Corbeille")}{" "}
            </button>
          </div>
          {filter === "trash" ? (
            <section className="panel">
              <h2>{tr("Corbeille récupérable")}</h2>
              <p className="muted">
                {" "}
                {tr(
                  "Les images restent sur le PC jusqu’à leur restauration. Aucune suppression définitive automatique.",
                )}{" "}
              </p>
              {trash.map((t) => (
                <div className="trash-row" key={t.id}>
                  <Trash2 size={20} />
                  <span>
                    <strong>{t.name}</strong>
                    <small>
                      {new Date(t.deleted).toLocaleString(locale())}
                    </small>
                  </span>
                  <button onClick={() => void restore(t)}>
                    <RotateCcw size={17} /> {tr("Restaurer")}{" "}
                  </button>
                </div>
              ))}
              {!trash.length && <p>{tr("La corbeille est vide.")}</p>}
            </section>
          ) : (
            <>
              <div className="section-heading gallery-heading">
                <h2>
                  {filter === "favorites"
                    ? tr("À garder tout près")
                    : tr("Votre collection")}
                </h2>
                <div className="gallery-density">
                  <span className="muted">{gallery.total} images</span>
                  <div
                    className="density-options"
                    role="group"
                    aria-label={tr("Nombre de colonnes")}
                  >
                    {[2, 3, 4].map((n) => (
                      <button
                        key={n}
                        aria-label={tr("{0} colonnes", [n])}
                        aria-pressed={columns === n}
                        onClick={() => {
                          setColumns(n);
                          writeStored("gallery-columns", n);
                        }}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {gallery.warnings.map((w, i) => (
                <p className="hint" key={i}>
                  {w}
                </p>
              ))}
              <GalleryGrid
                active={active}
                items={gallery.items}
                columns={columns}
                scope={`${server}|${root}|${filter}|${search}`}
                onFavorite={favorite}
                onTrash={deleteImage}
                onNotice={(text) => {
                  setUndo(null);
                  setNotice(text);
                }}
                onOpen={(i, url) =>
                  openViewer({
                    items: views(gallery.items).map((v, n) =>
                      n === i ? { ...v, url } : v,
                    ),
                    index: i,
                    fromGallery: true,
                  })
                }
              />
              {!gallery.items.length && galleryBusy && (
                <div
                  className="gallery-skeleton"
                  aria-hidden="true"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
                  }}
                >
                  {Array.from({ length: columns * 2 }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
              )}
              {!gallery.items.length && !galleryBusy && (
                <div className="panel empty-state">
                  <Heart size={32} />
                  <h3>
                    {search || root
                      ? tr("Aucune image ne correspond.")
                      : filter === "favorites"
                        ? tr("Vos coups de cœur auront leur place ici.")
                        : tr("Aucune image pour le moment.")}
                  </h3>
                  <p className="muted">
                    {search || root
                      ? tr(
                          "Essayez un autre nom ou explorez tous les dossiers.",
                        )
                      : filter === "favorites"
                        ? tr(
                            "Touchez le cœur d’une image pour la retrouver ici.",
                          )
                        : tr(
                            "Vos générations sur le PC apparaîtront dans cette collection.",
                          )}
                  </p>
                  {(search || root) && (
                    <button
                      onClick={() => {
                        setSearch("");
                        setRoot("");
                      }}
                    >
                      {" "}
                      {tr("Effacer les filtres")}{" "}
                    </button>
                  )}
                </div>
              )}
              {gallery.items.length < gallery.total && (
                <button
                  className="load-more"
                  disabled={galleryBusy}
                  onClick={() => void loadGallery(true).catch(() => {})}
                >
                  {" "}
                  {tr("Afficher la suite")}{" "}
                </button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
  if (setupOpen)
    return (
      <Onboarding
        step={setupStep}
        onStep={(n) => {
          setSetupStep(n);
          writeStored("onboarding-step", n);
        }}
        onLater={() => setSetupOpen(false)}
        onFinish={() => {
          if (!writeStored("onboarding-done", true))
            notify(
              tr(
                "Ce choix s’applique pour cette session ; l’enregistrement est indisponible.",
              ),
            );
          setSetupDone(true);
          setSetupOpen(false);
          setTab(server ? "create" : "connect");
        }}
        onConnect={() => {
          setSetupOpen(false);
          setTab("connect");
        }}
        online={online}
        leftHanded={leftHanded}
        onHandedness={(v) => {
          setLeftHanded(v);
          writeStored("left-handed", v);
        }}
        quickMenu={quickMenu}
        onQuickMenu={(v) => {
          setQuickMenu(v);
          writeStored("quick-menu", v);
        }}
      />
    );
  return (
    <div className={`app ${leftHanded ? "left-handed" : ""}`}><AppUpdater/>
      {tab === "create" && server && quickMenu && (
        <StudioNav
          active
          workflow={mode === "workflow"}
          leftHanded={leftHanded}
          generating={busy || !online || jobs.length > 0}
          onGenerate={() => {
            document
              .getElementById("studio-render")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
            void generate();
          }}
        />
      )}
      <a className="skip" href="#main">
        {" "}
        {tr("Aller au contenu")}{" "}
      </a>
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab(server ? "create" : "connect");
          }}
        >
          <span className="brand-icon">
            <Sparkles size={25} />
          </span>
          <span>
            Mochi
            <small>{tr("VOTRE ATELIER CRÉATIF")}</small>
          </span>
        </a>
        <nav aria-label={tr("Navigation principale")}>
          {(
            [
              { id: "create", label: tr("Atelier"), icon: SlidersHorizontal },
              { id: "gallery", label: tr("Galerie"), icon: Images },
              { id: "glossary", label: tr("Glossaire"), icon: BookOpen },
              { id: "connect", label: tr("Paramètres"), icon: Settings2 },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "nav active" : "nav"}
              onClick={() => setTab(t.id)}
              aria-label={t.label}
              title={t.label}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <span className="nav-icon">
                <t.icon size={19} strokeWidth={1.7} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Monitor size={22} />
          <p>
            {" "}
            {tr("Votre PC crée.")} <br /> {tr("Vos idées voyagent.")}{" "}
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mochi-wordmark">
            M O C H I <small>/ COMFYUI</small>
          </span>
          <button
            className="header-spark"
            aria-label={tr("Ouvrir l’Atelier")}
            onClick={() => setTab("create")}
          >
            <img src={mochiHeader} alt="" width={32} height={24} />
          </button>
        </header>
        <main id="main" className="page-window" {...handlers}>
          <div className="page-track" ref={trackRef}>
            {pages.map((page, i) => (
              <div
                key={page}
                className={`page-pane ${tab === page ? "active-pane" : ""}`}
                data-page={page}
                inert={tab !== page}
                aria-hidden={tab !== page}
                style={{ left: `${(i - pages.indexOf(tab)) * 100}%` }}
              >
                {renderPage(page, page === tab)}
              </div>
            ))}
          </div>
        </main>
        <div className="app-footer" />
      </div>
      <div className="toast-stack">
        {error && (
          <Toast
            key={"error:" + error}
            message={error}
            error
            onClose={() => setError("")}
          />
        )}
        {notice && (
          <Toast
            key={"notice:" + notice}
            message={notice}
            onClose={() => {
              setNotice("");
              setUndo(null);
            }}
          >
            {undo && (
              <button onClick={() => void restore(undo)}>
                <RotateCcw size={16} /> {tr("Annuler la suppression")}{" "}
              </button>
            )}
          </Toast>
        )}
      </div>
      {showImports && server && <ModelImports state={modelImports} onClose={() => setShowImports(false)} />}
      {showConnection && (
        <ConnectionStatus
          server={server}
          initial={stats}
          onClose={() => setShowConnection(false)}
          onSettings={() => {
            setShowConnection(false);
            setTab("connect");
          }}
        />
      )}
      {viewer && (
        <Suspense
          fallback={
            <div className="viewer-opening" role="status">
              <LoaderCircle className="spin" />{" "}
              {tr("Ouverture de l’image…")}{" "}
            </div>
          }
        >
          <Viewer
            items={viewer.items}
            index={viewer.index}
            onIndex={(index) =>
              setViewer((v) =>
                v ? { ...v, index: Math.min(index, v.items.length - 1) } : v,
              )
            }
            onClose={closeViewer}
            onFavorite={favorite}
            onTrash={deleteImage}
            onReuse={reuse}
            onMore={
              viewer.fromGallery && gallery.items.length < gallery.total
                ? async () => {
                    const session = viewerSession.current,
                      version = generation.current;
                    const next = await loadGallery(true);
                    if (
                      session !== viewerSession.current ||
                      version !== generation.current
                    )
                      return [];
                    const all = [
                      ...new Map(
                        [...viewer.items, ...views(next)].map((item) => [
                          item.path,
                          item,
                        ]),
                      ).values(),
                    ];
                    setViewer((v) => v && { ...v, items: all });
                    return all;
                  }
                : undefined
            }
          />
        </Suspense>
      )}
    </div>
  );
}
