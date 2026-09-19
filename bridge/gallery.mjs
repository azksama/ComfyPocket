import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TRASH } from "./library.mjs";

export function createGalleryIndex(
  roots,
  extensions,
  { ttl = 5000, now = Date.now } = {},
) {
  let cached = null,
    pending = null,
    revision = 0;

  async function scan() {
    const items = [],
      warnings = [],
      seen = new Set(),
      resolvedFiles = new Map();
    for (const [index, root] of roots.entries()) {
      const walk = async (dir, depth = 0) => {
        if (depth > 32) return;
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.name === TRASH || entry.isSymbolicLink()) continue;
          const file = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            try {
              await walk(file, depth + 1);
            } catch {
              warnings.push(`Sous-dossier inaccessible : ${entry.name}`);
            }
          } else if (
            entry.isFile() &&
            extensions.has(path.extname(entry.name).toLowerCase())
          ) {
            try {
              const canonical = await realpath(file);
              if (seen.has(canonical)) continue;
              const info = await stat(file);
              if (!info.isFile()) continue;
              seen.add(canonical);
              const item = {
                root: index,
                relative: path
                  .relative(root.path, file)
                  .split(path.sep)
                  .join("/"),
                name: entry.name,
                folder: root.name,
                size: info.size,
                modified: info.mtimeMs,
              };
              items.push(item);
              // Canonical paths stay internal and are reused for favorite lookup.
              resolvedFiles.set(item, canonical);
            } catch {
              /* A file may be moved while the collection is scanned. */
            }
          }
        }
      };
      try {
        await walk(root.path);
      } catch {
        warnings.push(`Dossier inaccessible : ${root.name}`);
      }
    }
    items.sort(
      (a, b) => b.modified - a.modified || a.relative.localeCompare(b.relative),
    );
    return { time: now(), items, warnings, resolvedFiles };
  }

  return {
    async list() {
      if (cached && now() - cached.time < ttl) return cached;
      if (!pending) {
        const startedAtRevision = revision;
        pending = scan()
          .then((result) => {
            // A trash/restore operation during a scan must not revive its cache.
            if (startedAtRevision === revision) cached = result;
            return result;
          })
          .finally(() => {
            pending = null;
          });
      }
      return pending;
    },
    invalidate() {
      revision++;
      cached = null;
    },
  };
}
