import { createCivitaiBrowser } from "./civitai-browser.mjs";
import https from "node:https";
import { timingSafeEqual } from "node:crypto";
import { realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { createModelImports } from "./model-imports.mjs";
import { createAssistant } from "./assistant.mjs";
import { library } from "./library.mjs";
import { createGalleryIndex } from "./gallery.mjs";
import { thumbnail } from "./thumbnails.mjs";
import { readBoundedResponse } from "./response.mjs";

const mime = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const allowed =
  /^(GET:(system_stats|object_info(?:\/[^/]+)?|history(?:\/[\w-]+)?|queue|models(?:\/[^/]+)?|view)|POST:(prompt|queue|interrupt))$/;
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let n = 0;
  const chunks = [];
  for await (const c of req) {
    n += c.length;
    if (n > 12 * 1024 * 1024)
      throw Object.assign(new Error("Requête trop volumineuse"), {
        status: 413,
      });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
export async function safeFile(root, relative) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes("\0") ||
    relative.split(/[\\/]/).some((s) => s === "..") ||
    relative.includes(":")
  )
    throw Object.assign(new Error("Chemin interdit"), { status: 403 });
  const base = await realpath(root),
    file = await realpath(path.join(base, relative));
  const rel = path.relative(base, file);
  if (
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    !mime[path.extname(file).toLowerCase()] ||
    !(await stat(file)).isFile()
  )
    throw Object.assign(new Error("Fichier interdit"), { status: 403 });
  return file;
}
export function createBridge(config) {
  const upstream = new URL(config.comfyUrl);
  if (
    !["http:", "https:"].includes(upstream.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname)
  )
    throw new Error("ComfyUI doit être sur le PC local (127.0.0.1).");
  const sessions = new Map();
  const lib = library(config, safeFile);
  const imports = createModelImports(config);
  const civitai = createCivitaiBrowser();
  const assistant = createAssistant(config);
  const gallery = createGalleryIndex(config.roots, new Set(Object.keys(mime)));
  function session(id) {
    if (!/^[\w-]{8,100}$/.test(id))
      throw Object.assign(new Error("Client invalide"), { status: 400 });
    let s = sessions.get(id);
    if (!s) {
      if (sessions.size >= 50)
        throw Object.assign(new Error("Trop de clients"), { status: 429 });
      s = {
        events: [],
        seq: 0,
        last: Date.now(),
        ws: null,
        connected: false,
        retry: 0,
      };
      sessions.set(id, s);
    }
    s.last = Date.now();
    if (!s.ws && Date.now() > s.retry) {
      const url = new URL("/ws", upstream);
      url.protocol = upstream.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("clientId", id);
      const ws = new WebSocket(url, { maxPayload: 12 * 1024 * 1024 });
      s.ws = ws;
      ws.on("open", () => (s.connected = true));
      ws.on("message", (data, binary) => {
        let event;
        if (binary) {
          if (data.length < 9 || data.readUInt32BE(0) !== 1) return;
          const type = data.readUInt32BE(4);
          if (type !== 1 && type !== 2) return;
          event = {
            type: "preview",
            data: `data:image/${type === 2 ? "png" : "jpeg"};base64,${data.subarray(8).toString("base64")}`,
          };
        } else {
          try {
            event = JSON.parse(data.toString());
          } catch {
            return;
          }
        }
        s.events.push({ seq: ++s.seq, ...event });
        if (s.events.length > 80) s.events.splice(0, s.events.length - 80);
      });
      ws.on("error", () => {});
      ws.on("close", () => {
        s.connected = false;
        s.ws = null;
        s.retry = Date.now() + 3000;
      });
    }
    return s;
  }
  const cleanup = setInterval(() => {
    for (const [id, s] of sessions)
      if (Date.now() - s.last > 120000) {
        s.ws?.terminate();
        sessions.delete(id);
      }
  }, 30000);
  cleanup.unref();
  const server = https.createServer(
    { key: config.key, cert: config.cert },
    async (req, res) => {
      try {
        // No browser origins are accepted; Android/desktop use the native TLS client.
        if (req.headers.origin)
          return json(res, 403, { error: "Origine navigateur interdite" });
        const token = Buffer.from(
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
        );
        const expected = Buffer.from(config.token);
        if (
          token.length !== expected.length ||
          !timingSafeEqual(token, expected)
        )
          return json(res, 401, { error: "Clé d’accès invalide" });
        const url = new URL(req.url, "https://localhost");
        if (req.method === "GET" && url.pathname === "/bridge/info")
          return json(res, 200, {
            version: 4,
            modelImports: true,
            modelProfiles: true,
            modelMetadata: true,
            civitaiBrowser: true,
            assistant: true,
            roots: config.roots.map((r, i) => ({ id: i, name: r.name })),
          });
        if (url.pathname === "/bridge/civitai/search" && req.method === "POST") return json(res, 200, await civitai.search(JSON.parse((await body(req)).toString())));
        if (url.pathname === "/bridge/civitai/image" && req.method === "GET") {
          const content = await civitai.image(url.searchParams.get("id"));
          res.writeHead(200, {"Content-Type":"image/webp", "Cache-Control":"private, max-age=900", "X-Content-Type-Options":"nosniff"});
          return res.end(content);
        }
        if (url.pathname === "/bridge/assistant" && req.method === "GET") return json(res, 200, assistant.status());
        if (url.pathname === "/bridge/assistant/settings" && req.method === "POST") return json(res, 200, await assistant.configure(JSON.parse((await body(req)).toString())));
        if (url.pathname === "/bridge/assistant/jobs" && req.method === "POST") return json(res, 202, assistant.start(JSON.parse((await body(req)).toString())));
        if (url.pathname === "/bridge/assistant/job" && req.method === "GET") return json(res, 200, assistant.get(url.searchParams.get("id")));
        if (url.pathname === "/bridge/assistant/cancel" && req.method === "POST") return json(res, 200, assistant.cancel(JSON.parse((await body(req)).toString()).id));
        if (url.pathname === "/bridge/imports" && req.method === "GET") return json(res,200,await imports.list());
        if (req.method === "POST" && ["/bridge/imports/inspect","/bridge/imports/start","/bridge/imports/cancel"].includes(url.pathname)) {
          const input = JSON.parse((await body(req)).toString());
          const action = url.pathname.split("/").pop();
          return json(res,200,await (action === "inspect" ? imports.inspect(input) : action === "start" ? imports.start(input) : imports.cancel(input.id)));
        }
        if (req.method === "POST" && url.pathname === "/bridge/model-metadata") {
          const input = JSON.parse((await body(req)).toString());
            if (!input || !Array.isArray(input.names) || input.names.length > 100 || input.names.some(name => typeof name !== "string" || !name || name.length > 1024) || !["loras", "checkpoints", "diffusion_models"].includes(input.kind)) return json(res, 400, {error:"Liste de modèles invalide"});
          const items = [];
          for (const name of [...new Set(input.names)]) {
            try { const info = await lib.modelInfo(input.kind, name); items.push({name, baseModel:info.baseModel}); }
            catch(e) { if (e.status === 403) throw e; items.push({name, baseModel:"", error:"Métadonnées indisponibles"}); }
          }
          return json(res, 200, {items});
        }
        if (req.method === "GET" && url.pathname === "/bridge/model-profile")
          return json(res, 200, await lib.modelProfile(url.searchParams.get("kind"), url.searchParams.get("name")));
        if (req.method === "GET" && url.pathname === "/bridge/model-info")
          return json(
            res,
            200,
            await lib.modelInfo(
              url.searchParams.get("kind"),
              url.searchParams.get("name"),
            ),
          );
        if (req.method === "GET" && url.pathname === "/bridge/model-favorites")
          return json(res, 200, await lib.modelFavorites());
        if (req.method === "POST" && url.pathname === "/bridge/model-favorites")
          return json(
            res,
            200,
            await lib.modelFavorite(JSON.parse((await body(req)).toString())),
          );
        if (req.method === "GET" && url.pathname === "/bridge/gallery") {
          const data = await gallery.list();
          const q = (url.searchParams.get("q") ?? "").toLowerCase();
          const root = url.searchParams.get("root");
          const candidates = data.items.filter(
            (i) =>
              (!q || i.relative.toLowerCase().includes(q)) &&
              (root === null || String(i.root) === root),
          );
          const favoritesOnly = url.searchParams.get("favorite") === "true";
          const filtered = favoritesOnly
            ? (await lib.decorate(candidates, data.resolvedFiles)).filter(
                (item) => item.favorite,
              )
            : candidates;
          const number = (name, fallback) => {
            const value = Number(url.searchParams.get(name));
            return Number.isFinite(value) && value > 0
              ? Math.floor(value)
              : fallback;
          };
          const offset = number("offset", 0);
          const limit = Math.min(100, Math.max(1, number("limit", 40)));
          const page = filtered.slice(offset, offset + limit);
          return json(res, 200, {
            items: favoritesOnly
              ? page
              : await lib.decorate(page, data.resolvedFiles),
            total: filtered.length,
            warnings: data.warnings,
          });
        }
        if (req.method === "GET" && url.pathname === "/bridge/trash")
          return json(res, 200, { items: await lib.trashList() });
        if (
          req.method === "POST" &&
          ["/bridge/favorite", "/bridge/trash", "/bridge/restore"].includes(
            url.pathname,
          )
        ) {
          const action = url.pathname.slice(8);
          const result = await lib[action](
            JSON.parse((await body(req)).toString()),
          );
          if (action !== "favorite") gallery.invalidate();
          return json(res, 200, result);
        }
        if (
          req.method === "GET" &&
          ["/bridge/file", "/bridge/model-preview"].includes(url.pathname)
        ) {
          const root = config.roots[Number(url.searchParams.get("root"))];
          if (!root && url.pathname === "/bridge/file")
            return json(res, 404, { error: "Dossier inconnu" });
          const file =
            url.pathname === "/bridge/model-preview"
              ? await lib.preview(
                  url.searchParams.get("kind"),
                  url.searchParams.get("name"),
                )
              : await safeFile(root.path, url.searchParams.get("relative"));
          const info = await stat(file);
          if (info.size > 64 * 1024 * 1024)
            return json(res, 413, { error: "Image supérieure à 64 Mo" });
          const small =
            url.searchParams.get("thumb") === "1" ||
            url.pathname === "/bridge/model-preview";
          const content = small
            ? await thumbnail(file, `${file}:${info.mtimeMs}:${info.size}`)
            : await readFile(file);
          res.writeHead(200, {
            "Content-Type": small
              ? "image/jpeg"
              : mime[path.extname(file).toLowerCase()],
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
          });
          return res.end(content);
        }
        if (req.method === "GET" && url.pathname === "/bridge/events") {
          const s = session(url.searchParams.get("clientId") ?? "");
          const after = Number(url.searchParams.get("after")) || 0;
          return json(res, 200, {
            connected: s.connected,
            seq: s.seq,
            events: s.events.filter((e) => e.seq > after),
          });
        }
        if (url.pathname.startsWith("/api/")) {
          const route = url.pathname.slice(5);
          if (!allowed.test(`${req.method}:${route}`))
            return json(res, 403, { error: "Route non autorisée" });
          const target = new URL("/" + route, upstream);
          target.search = url.search;
          const headers = {};
          let payload;
          if (req.method === "POST") {
            payload = await body(req);
            JSON.parse(payload.toString());
            headers["Content-Type"] = "application/json";
          }
          const response = await fetch(target, {
            method: req.method,
            headers,
            body: payload,
            signal: AbortSignal.timeout(35000),
            redirect: "error",
          });
          const data = await readBoundedResponse(response, 64 * 1024 * 1024);
          if (
            route === "view" &&
            response.ok &&
            url.searchParams.get("thumb") === "1"
          ) {
            const content = await thumbnail(
              data,
              `upstream:${target.href}:${data.length}`,
            );
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            return res.end(content);
          }
          res.writeHead(response.status, {
            "Content-Type":
              response.headers.get("content-type") ?? "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          return res.end(data.length ? data : Buffer.from("{}"));
        }
        return json(res, 404, { error: "Route inconnue" });
      } catch (e) {
        if (!res.headersSent)
          json(res, e.status ?? (e.name === "SyntaxError" ? 400 : 502), {
            error: e.status
              ? e.message
              : "ComfyUI ou fichier indisponible. Vérifiez le moteur et les dossiers.",
          });
        else res.end();
      }
    },
  );
  server.on("close", () => {
    clearInterval(cleanup);
    imports.close();
    assistant.close();
    for (const s of sessions.values()) s.ws?.terminate();
  });
  return server;
}
