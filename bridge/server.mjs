import https from "node:https";
import { timingSafeEqual } from "node:crypto";
import { readdir, realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";
import { library, TRASH } from "./library.mjs";
import { thumbnail } from "./thumbnails.mjs";

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
    !mime[path.extname(file).toLowerCase()]
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
  let galleryCache = null,
    scanPromise = null;
  async function gallery() {
    if (galleryCache && Date.now() - galleryCache.time < 5000)
      return galleryCache;
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const items = [],
        warnings = [],
        seen = new Set();
      for (const [index, root] of config.roots.entries()) {
        const scan = async (dir, depth = 0) => {
          if (depth > 32) return;
          for (const ent of await readdir(dir, { withFileTypes: true })) {
            if (ent.name === TRASH) continue;
            const file = path.join(dir, ent.name);
            if (ent.isSymbolicLink()) continue;
            if (ent.isDirectory()) {
              try {
                await scan(file, depth + 1);
              } catch {
                warnings.push(`Sous-dossier inaccessible : ${ent.name}`);
              }
            } else if (
              ent.isFile() &&
              mime[path.extname(ent.name).toLowerCase()]
            ) {
              try {
                const canonical = await realpath(file);
                if (seen.has(canonical)) continue;
                seen.add(canonical);
                const info = await stat(file);
                items.push({
                  root: index,
                  relative: path
                    .relative(root.path, file)
                    .split(path.sep)
                    .join("/"),
                  name: ent.name,
                  folder: root.name,
                  size: info.size,
                  modified: info.mtimeMs,
                });
              } catch {}
            }
          }
        };
        try {
          await scan(root.path);
        } catch {
          warnings.push(`Dossier inaccessible : ${root.name}`);
        }
      }
      items.sort(
        (a, b) =>
          b.modified - a.modified || a.relative.localeCompare(b.relative),
      );
      return (galleryCache = { time: Date.now(), items, warnings });
    })();
    try {
      return await scanPromise;
    } finally {
      scanPromise = null;
    }
  }
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
            version: 3,
            roots: config.roots.map((r, i) => ({ id: i, name: r.name })),
          });
        if (req.method === "GET" && url.pathname === "/bridge/model-favorites") return json(res, 200, await lib.modelFavorites());
        if (req.method === "POST" && url.pathname === "/bridge/model-favorites") return json(res, 200, await lib.modelFavorite(JSON.parse((await body(req)).toString())));
        if (req.method === "GET" && url.pathname === "/bridge/gallery") {
          const data = await gallery();
          const q = (url.searchParams.get("q") ?? "").toLowerCase();
          const root = url.searchParams.get("root");
          const marked = await lib.decorate(data.items);
          const filtered = marked.filter(
            (i) =>
              (!q || i.relative.toLowerCase().includes(q)) &&
              (root === null || String(i.root) === root) &&
              (url.searchParams.get("favorite") !== "true" || i.favorite),
          );
          const offset = Math.max(
            0,
            Number(url.searchParams.get("offset")) || 0,
          );
          const limit = Math.min(
            100,
            Math.max(1, Number(url.searchParams.get("limit")) || 40),
          );
          return json(res, 200, {
            items: filtered.slice(offset, offset + limit),
            total: filtered.length,
            warnings: data.warnings,
          });
        }
        if (req.method === "GET" && url.pathname === "/bridge/trash")
          return json(res, 200, { items: await lib.trashList() });
        if (req.method === "POST" && ["/bridge/favorite", "/bridge/trash", "/bridge/restore"].includes(url.pathname)) {
          const action = url.pathname.slice(8);
          const result = await lib[action](JSON.parse((await body(req)).toString()));
          galleryCache = null;
          return json(res, 200, result);
        }
        if (req.method === "GET" && ["/bridge/file", "/bridge/model-preview"].includes(url.pathname)) {
          const root = config.roots[Number(url.searchParams.get("root"))];
          if (!root && url.pathname === "/bridge/file") return json(res, 404, { error: "Dossier inconnu" });
          const file = url.pathname === "/bridge/model-preview" ? await lib.preview(url.searchParams.get("kind"), url.searchParams.get("name")) : await safeFile(
            root.path,
            url.searchParams.get("relative"),
          );
          const info = await stat(file);
          if (info.size > 64 * 1024 * 1024)
            return json(res, 413, { error: "Image supérieure à 64 Mo" });
          const small = url.searchParams.get("thumb") === "1" || url.pathname === "/bridge/model-preview";
          const content = small ? await thumbnail(file, `${file}:${info.mtimeMs}:${info.size}`) : await readFile(file);
          res.writeHead(200, {
            "Content-Type": small ? "image/jpeg" : mime[path.extname(file).toLowerCase()],
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
          const data = Buffer.from(await response.arrayBuffer());
          if (data.length > 64 * 1024 * 1024)
            return json(res, 413, { error: "Réponse trop volumineuse" });
          if (route === "view" && response.ok && url.searchParams.get("thumb") === "1") {
            const content = await thumbnail(data, `upstream:${target.href}:${data.length}`);
            res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
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
    for (const s of sessions.values()) s.ws?.terminate();
  });
  return server;
}
