import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGalleryIndex } from "./gallery.mjs";
import { library, TRASH } from "./library.mjs";
import { safeFile } from "./server.mjs";

test("gallery scans are shared, cached and refreshed after mutation or expiry", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "pocket-gallery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, TRASH));
  await writeFile(path.join(dir, TRASH, "deleted.png"), "image");
  await writeFile(path.join(dir, "first.png"), "image");
  await writeFile(path.join(dir, "readme.txt"), "text");
  const roots = [
    { name: "Output", path: dir },
    { name: "Duplicate", path: dir },
  ];
  let time = 0;
  const index = createGalleryIndex(roots, new Set([".png"]), {
    now: () => time,
  });
  const [first, concurrent] = await Promise.all([index.list(), index.list()]);
  assert.strictEqual(first, concurrent);
  assert.deepEqual(
    first.items.map((item) => item.name),
    ["first.png"],
  );
  await writeFile(path.join(dir, "second.png"), "image");
  assert.strictEqual(await index.list(), first);
  index.invalidate();
  const second = await index.list();
  assert.equal(second.items.length, 2);
  await rm(path.join(dir, "first.png"));
  time = 5000;
  const refreshed = await index.list();
  assert.deepEqual(
    refreshed.items.map((item) => item.name),
    ["second.png"],
  );
});

test("favorite decoration reuses scan paths but always reads current favorite state", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "pocket-gallery-marks-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "output");
  await mkdir(root);
  await writeFile(path.join(root, "lake.png"), "image");
  const roots = [{ name: "Output", path: root }];
  const index = createGalleryIndex(roots, new Set([".png"]));
  const snapshot = await index.list();
  let resolutions = 0;
  const lib = library({ roots, stateDir: dir }, (...args) => {
    resolutions++;
    return safeFile(...args);
  });
  const [item] = snapshot.items;
  assert.equal(
    (await lib.decorate([item], snapshot.resolvedFiles))[0].favorite,
    false,
  );
  assert.equal(resolutions, 0);
  await lib.favorite({ ...item, favorite: true });
  resolutions = 0;
  assert.equal(
    (await lib.decorate([item], snapshot.resolvedFiles))[0].favorite,
    true,
  );
  assert.equal(resolutions, 0);
  await rm(path.join(root, "lake.png"));
  assert.equal(
    (await lib.decorate([item], snapshot.resolvedFiles))[0].favorite,
    true,
  );
});
