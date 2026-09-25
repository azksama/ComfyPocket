import path from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
  lstat,
  stat,
  statfs,
  open,
  link,
  unlink,
} from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { inspectModel, kinds, modelFilename } from "./model-sources.mjs";
import { remoteStream, importError as fail } from "./import-network.mjs";
import { installPreview } from "./model-preview.mjs";
const MAX_BYTES = 64 * 1024 ** 3;
const active = (j) => ["queued", "downloading", "verifying"].includes(j.status);
export function createModelImports(
  config,
  { inspect = inspectModel, stream = remoteStream } = {},
) {
  const stateFile = path.join(
    config.stateDir || path.dirname(config.roots[0].path),
    "model-imports.json",
  );
  const plans = new Map(),
    pending = new Map(),
    reservations = new Set();
  let jobs = [],
    revision = 0,
    running = false,
    writes = Promise.resolve(),
    inspecting = 0;
  const persist = () => {
    const value = JSON.stringify({ revision, jobs });
    const next = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(stateFile), { recursive: true });
        await writeFile(stateFile + ".pending", value, { mode: 0o600 });
        await rename(stateFile + ".pending", stateFile);
      });
    writes = next;
    return next;
  };
  async function folder(kind) {
    if (!kinds.includes(kind))
      throw fail("Choisissez une catégorie de modèle.");
    const configured = config.modelPaths?.[kind]?.[0];
    if (configured) {
      if (!path.isAbsolute(configured)) throw fail("Dossier du PC invalide.");
      return realpath(configured);
    }
    const root =
      config.comfyDirectory ||
      (path.basename(config.roots[0].path).toLowerCase() === "output"
        ? path.dirname(config.roots[0].path)
        : null);
    if (
      !root ||
      !(await stat(path.join(root, "main.py")).catch(() => null))?.isFile()
    )
      throw fail(
        "Installation ComfyUI introuvable. Configurez les dossiers dans Mochi Studio.",
      );
    const target = path.join(root, "models", kind);
    await mkdir(target, { recursive: true });
    return realpath(target);
  }
  const ready = (async () => {
    let saved;
    try {
      saved = JSON.parse(await readFile(stateFile, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw fail("Historique des téléchargements illisible sur le PC.", 503);
    }
    if (!Array.isArray(saved.jobs))
      throw fail("Historique des téléchargements invalide.", 503);
    jobs = saved.jobs.slice(-30);
    revision = Number(saved.revision) || 0;
    for (const j of jobs)
      if (active(j)) {
        j.status = "error";
        j.error =
          "Téléchargement interrompu par l’arrêt du PC. Relancez l’import avec le lien d’origine.";
        if (/^[a-f0-9-]{36}$/.test(j.id))
          try {
            await unlink(
              path.join(await folder(j.kind), `.mochi-import-${j.id}.part`),
            );
          } catch {}
      }
    await persist();
  })();
  ready.catch(() => {});
  const expiration = setInterval(() => {
    for (const [id, plan] of plans) if (Date.now() - plan.created > 15 * 60000) plans.delete(id);
  }, 60000);
  expiration.unref();
  async function download(job, item) {
    let temporary;
    try {
      job.status = "downloading";
      await persist();
      const destination = await folder(job.kind);
      const target = path.join(destination, modelFilename(job.name));
      if (
        await lstat(target).catch((e) => {
          if (e.code !== "ENOENT") throw e;
          return null;
        })
      )
        throw fail(
          "Ce fichier existe déjà sur le PC. Aucun fichier n’a été remplacé.",
          409,
        );
      const space = await statfs(destination);
      const free = Number(space.bavail) * Number(space.bsize);
      if (item.file.size && item.file.size + 64 * 1024 ** 2 > free)
        throw fail("Espace disque insuffisant sur le PC.");
      const response = await stream(item.file.url, {
        provider: item.provider,
        token: item.token,
        download: true,
        signal: item.controller.signal,
      });
      const length = Number(response.headers["content-length"]) || null;
      const type = String(response.headers["content-type"] || "");
      if (/text\/|application\/(json|xml)/i.test(type)) {
        response.destroy();
        throw fail("Le fournisseur a renvoyé une page web au lieu du modèle.");
      }
      if (length && (length > MAX_BYTES || length + 64 * 1024 ** 2 > free)) {
        response.destroy();
        throw fail("Fichier trop volumineux ou espace disque insuffisant.");
      }
      job.total = length || item.file.size || null;
      temporary = path.join(destination, `.mochi-import-${job.id}.part`);
      const handle = await open(temporary, "wx", 0o600);
      const hash = createHash("sha256");
      let signature = Buffer.alloc(0);
      try {
        for await (const chunk of response) {
          item.controller.signal.throwIfAborted();
          job.received += chunk.length;
          if (job.received > MAX_BYTES || job.received + 64 * 1024 ** 2 > free)
            throw fail("Limite de taille ou espace disque atteint.");
          if (signature.length < 512)
            signature = Buffer.concat([signature, chunk]).subarray(0, 512);
          hash.update(chunk);
          await handle.writeFile(chunk);
        }
        await handle.sync();
      } finally {
        response.destroy();
        await handle.close();
      }
      item.controller.signal.throwIfAborted();
      if (!job.received || (length && job.received !== length))
        throw fail("Téléchargement incomplet. Réessayez.");
      if (/^\s*(<!doctype|<html|\{\s*"error)/i.test(signature.toString("utf8")))
        throw fail("Le fichier reçu n’est pas un modèle.");
      if (
        job.name.endsWith(".safetensors") &&
        (signature.length < 9 ||
          signature.readBigUInt64LE(0) > BigInt(job.received - 8) ||
          signature[8] !== 123)
      )
        throw fail("Le fichier SafeTensors reçu est invalide.");
      job.status = "verifying";
      await persist();
      const digest = hash.digest("hex");
      if (item.file.sha256 && digest !== item.file.sha256)
        throw fail(
          "La vérification SHA-256 a échoué. Le fichier n’a pas été installé.",
        );
      item.controller.signal.throwIfAborted();
      await link(temporary, target);
      await unlink(temporary);
      temporary = null;
      job.illustration = await installPreview(target, item.file.previewUrl, {
        provider: item.provider, token: item.token, signal: item.controller.signal, stream,
      }).catch(() => "failed");
      job.status = "completed";
      job.received = job.total = job.received;
      job.completed = Date.now();
      job.sha256 = digest;
      revision++;
    } catch (e) {
      job.status = item.controller.signal.aborted ? "cancelled" : "error";
      job.error =
        job.status === "cancelled"
          ? null
          : e.code === "ENOSPC"
            ? "Espace disque insuffisant sur le PC."
            : e.code === "EEXIST"
              ? "Ce fichier existe déjà. Aucun fichier n’a été remplacé."
              : e.status
                ? e.message
                : "Téléchargement impossible. Vérifiez la connexion et les droits du dossier sur le PC.";
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      pending.delete(job.id);
      item.token = "";
      await persist();
    }
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      for (const job of jobs) {
        if (job.status === "queued" && pending.has(job.id))
          await download(job, pending.get(job.id));
      }
    } finally {
      running = false;
      if (jobs.some((j) => j.status === "queued" && pending.has(j.id)))
        void drain().catch(() => {});
    }
  }
  return {
    async list() {
      await ready;
      return { revision, jobs: jobs.map((j) => ({ ...j })) };
    },
    async inspect(input) {
      await ready;
      if (inspecting >= 2)
        throw fail("Une analyse est déjà en cours. Réessayez.", 429);
      for (const [id, p] of plans)
        if (Date.now() - p.created > 15 * 60000) plans.delete(id);
      if (plans.size >= 20)
        throw fail(
          "Trop de liens analysés. Réessayez dans quelques minutes.",
          429,
        );
      inspecting++;
      try {
        const plan = await inspect(input);
        const id = randomUUID();
        plans.set(id, { ...plan, created: Date.now() });
        return {
          id,
          provider: plan.provider,
          title: plan.title,
          files: plan.files.map(({ url, previewUrl, sha256, ...file }) => file),
        };
      } finally {
        inspecting--;
      }
    },
    async start(input) {
      await ready;
      const plan = plans.get(input?.planId);
      if (!plan || Date.now() - plan.created > 15 * 60000)
        throw fail("Le lien analysé a expiré. Analysez-le de nouveau.");
      const file = plan.files.find((f) => f.id === input.fileId);
      if (!file) throw fail("Choisissez un fichier.");
      const kind = input.kind || file.kind;
      if (!kinds.includes(kind))
        throw fail("Choisissez le dossier correspondant au type de modèle.");
      if (file.size > MAX_BYTES) throw fail("Limite de 64 Go par fichier.");
      modelFilename(file.name);
      if (jobs.filter(active).length + reservations.size >= 8)
        throw fail("La file de téléchargement est pleine.", 429);
      if (
        jobs.some((j) => active(j) && j.kind === kind && j.name === file.name)
      )
        throw fail("Ce fichier est déjà en téléchargement.", 409);
      const reservation = kind + ":" + file.name;
      if (reservations.has(reservation))
        throw fail("Ce fichier est déjà en téléchargement.", 409);
      reservations.add(reservation);
      try {
        await folder(kind);
        const job = {
          id: randomUUID(),
          name: file.name,
          kind,
          provider: plan.provider,
          title: plan.title,
          status: "queued",
          received: 0,
          total: file.size || null,
          created: Date.now(),
        };
        jobs = jobs
          .filter((j) => active(j))
          .concat(jobs.filter((j) => !active(j)).slice(-21), job);
        pending.set(job.id, {
          file,
          provider: plan.provider,
          token: plan.token,
          controller: new AbortController(),
        });
        try {
          await persist();
        } catch (e) {
          jobs = jobs.filter((j) => j.id !== job.id);
          pending.delete(job.id);
          throw e;
        }
        // Credentials never leave process memory and are discarded when the plan is consumed.
        plans.delete(input.planId);
        void drain().catch(() => {});
        return { ...job };
      } finally {
        reservations.delete(reservation);
      }
    },
    async cancel(id) {
      await ready;
      const job = jobs.find((j) => j.id === id),
        item = pending.get(id);
      if (job && item && active(job)) {
        item.controller.abort();
        if (job.status === "queued") {
          job.status = "cancelled";
          pending.delete(id);
          item.token = "";
          await persist();
        }
      }
      return { cancelled: !!job };
    },
    close() {
      clearInterval(expiration);
      for (const item of pending.values()) item.controller.abort();
      plans.clear();
    },
  };
}
