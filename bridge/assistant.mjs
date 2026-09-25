import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const models = JSON.parse(
  readFileSync(path.join(directory, "assistant-models.json"), "utf8"),
);
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const busyPhases = new Set(["queued", "downloading", "processing"]);

export function validateAssistantInput(input) {
  if (!input || !["transcribe", "optimize", "download"].includes(input.action))
    throw fail("Action inconnue.");
  if (input.action === "download") {
    if (!["whisper", "danbot", "both"].includes(input.target))
      throw fail("Modèle inconnu.");
    return { action: input.action, target: input.target };
  }
  if (!["fr", "en"].includes(input.language)) throw fail("Langue invalide.");
  if (input.action === "transcribe") {
    if (
      typeof input.audio !== "string" ||
      input.audio.length > 2560000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        input.audio,
      )
    )
      throw fail("Enregistrement invalide.");
    const bytes = Buffer.from(input.audio, "base64");
    if (
      bytes.length < 3200 ||
      bytes.length > 16000 * 2 * 60 ||
      bytes.length % 2
    )
      throw fail("La dictée doit durer entre 0,1 et 60 secondes.");
    return {
      action: input.action,
      language: input.language,
      audio: input.audio,
    };
  }
  if (
    typeof input.description !== "string" ||
    !input.description.trim() ||
    input.description.length > 5000 ||
    !["positive", "negative"].includes(input.side)
  )
    throw fail("Description invalide (1 à 5 000 caractères).");
  return {
    action: input.action,
    language: input.language,
    description: input.description.trim(),
    side: input.side,
  };
}

export function createAssistant(config, { spawnWorker = spawn } = {}) {
  const root = path.join(
    config.stateDir || path.dirname(config.roots[0].path),
    "assistant",
  );
  const settingsFile = path.join(root, "settings.json");
  const python =
    config.assistantPython ||
    path.join(
      path.dirname(config.roots[0].path),
      "venv",
      "Scripts",
      "python.exe",
    );
  let settings = { model: "medium", device: "auto" };
  try {
    const saved = JSON.parse(readFileSync(settingsFile, "utf8"));
    if (["small", "medium", "large-v3"].includes(saved.model))
      settings.model = saved.model;
    if (["auto", "cuda", "cpu"].includes(saved.device))
      settings.device = saved.device;
  } catch {
    /* Defaults also recover a damaged preference file. */
  }
  let active = null,
    lastDownload = null,
    configuring = false;
  const jobs = new Map();
  const cleanup = setInterval(() => {
    for (const [id, job] of jobs)
      if (job !== active && Date.now() - job.created > 15 * 60 * 1000)
        jobs.delete(id);
  }, 60000);
  cleanup.unref();
  const installed = (key) => {
    try {
      return (
        JSON.parse(
          readFileSync(
            path.join(root, "models", key, "installed.json"),
            "utf8",
          ),
        ).revision === models[key].revision
      );
    } catch {
      return false;
    }
  };
  const status = () => ({
    supported: true,
    runtimeReady: existsSync(python),
    ...settings,
    ready: installed(settings.model),
    taggerReady: installed("danbot") && installed("fr-en"),
    phase: active?.action === "download" ? active.phase : "idle",
    received: active?.action === "download" ? active.received || 0 : 0,
    size:
      active?.action === "download"
        ? active.size || 0
        : models[settings.model].size,
    downloadId: active?.action === "download" ? active.id : null,
    error: lastDownload?.phase === "error" ? lastDownload.error : "",
    models: Object.entries(models)
      .filter(([key]) => key !== "fr-en")
      .map(([id, model]) => ({
        id,
        size: model.size + (id === "danbot" ? models["fr-en"].size : 0),
        installed: installed(id) && (id !== "danbot" || installed("fr-en")),
        repo: model.repo,
      })),
  });
  async function configure(input) {
    if (active || configuring)
      throw fail("Un traitement est déjà en cours.", 409);
    if (
      !["small", "medium", "large-v3"].includes(input?.model) ||
      !["auto", "cuda", "cpu"].includes(input?.device)
    )
      throw fail("Réglages invalides.");
    const next = { model: input.model, device: input.device };
    configuring = true;
    try {
      await mkdir(root, { recursive: true });
      await writeFile(settingsFile + ".tmp", JSON.stringify(next));
      await rename(settingsFile + ".tmp", settingsFile);
      settings = next;
    } finally {
      configuring = false;
    }
    return status();
  }
  function get(id) {
    const job = jobs.get(id);
    if (!job) throw fail("Traitement inconnu ou expiré.", 404);
    const { child, timer, ...publicJob } = job;
    return publicJob;
  }
  function cancel(id) {
    const job = jobs.get(id);
    if (!job) throw fail("Traitement inconnu.", 404);
    if (busyPhases.has(job.phase)) {
      job.phase = "cancelled";
      job.text = "";
      job.blocks = [];
      job.child?.kill();
    }
    return get(id);
  }
  function start(input) {
    const args = validateAssistantInput(input);
    if (active || configuring)
      throw fail(
        "Un traitement vocal ou de tags est déjà en cours sur le PC.",
        409,
      );
    if (!existsSync(python))
      throw fail(
        "Python ComfyUI introuvable. Vérifiez le dossier du moteur dans Mochi Studio.",
        503,
      );
    if (
      args.action !== "download" &&
      !(args.action === "transcribe"
        ? installed(settings.model)
        : installed("danbot") && installed("fr-en"))
    )
      throw fail("Téléchargez les modèles sur le PC avant de continuer.", 409);
    const id = randomUUID();
    const job = {
      id,
      action: args.action,
      phase: args.action === "download" ? "downloading" : "processing",
      error: "",
      received: 0,
      size: 0,
      created: Date.now(),
    };
    active = job;
    if (args.action === "download") lastDownload = job;
    jobs.set(id, job);
    for (const [key, value] of jobs)
      if (Date.now() - value.created > 15 * 60 * 1000) jobs.delete(key);
    while (jobs.size > 25) jobs.delete(jobs.keys().next().value);
    const keys =
      args.target === "whisper"
        ? [settings.model]
        : args.target === "danbot"
          ? ["danbot", "fr-en"]
          : [settings.model, "danbot", "fr-en"];
    if (args.action === "download")
      job.size = keys.reduce((n, key) => n + models[key].size, 0);
    let pending = "";
    const child = spawnWorker(
      python,
      ["-u", path.join(directory, "assistant-worker.py"), root],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PYTHONUTF8: "1", HF_HUB_DISABLE_TELEMETRY: "1" },
      },
    );
    job.child = child;
    job.timer = setTimeout(
      () => {
        job.error = "Délai de traitement dépassé. Réessayez.";
        job.phase = "error";
        child.kill();
      },
      args.action === "download" ? 60 * 60 * 1000 : 5 * 60 * 1000,
    );
    job.timer.unref();
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      if (!busyPhases.has(job.phase)) return;
      pending += chunk.toString();
      if (pending.length > 128000) {
        job.error = "Réponse du moteur invalide.";
        job.phase = "error";
        child.kill();
        return;
      }
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try {
          const value = JSON.parse(line);
          for (const key of [
            "phase",
            "error",
            "received",
            "size",
            "text",
            "blocks",
            "device",
          ])
            if (value[key] !== undefined) job[key] = value[key];
        } catch {
          /* Library diagnostics are not protocol messages. */
        }
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", () => {
      job.phase = "error";
      job.error = "Le moteur vocal du PC n’a pas pu démarrer.";
    });
    child.on("close", (code) => {
      clearTimeout(job.timer);
      job.child = null;
      if (busyPhases.has(job.phase)) {
        job.phase = "error";
        job.error = code
          ? "Moteur IA indisponible. Vérifiez PyTorch, Transformers et SentencePiece dans ComfyUI."
          : "Le moteur n’a renvoyé aucun résultat.";
      }
      if (active === job) active = null;
    });
    child.stdin.end(JSON.stringify({ ...args, keys, ...settings }));
    return get(id);
  }
  return {
    status,
    configure,
    start,
    get,
    cancel,
    close: () => {
      clearInterval(cleanup);
      if (active) cancel(active.id);
    },
  };
}
