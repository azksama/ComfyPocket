import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const cert = { url: "https://192.168.1.8:8189", token: "test-key".repeat(8), certificate: "TEST CERTIFICATE" };
const info = {
  CheckpointLoaderSimple: { input: { required: { ckpt_name: [["dreamshaper_8.safetensors", "landscape.safetensors"]] } } },
  KSampler: { input: { required: { sampler_name: [["euler", "euler_ancestral"]], scheduler: [["normal", "karras"]] } } },
  LoraLoader: { input: { required: { lora_name: [["film.safetensors"]] } } },
  LatentUpscale: { input: { required: { upscale_method: [["nearest-exact", "bislerp"]] } } },
  ImageScaleBy: { input: { required: { upscale_method: [["nearest-exact", "lanczos"]] } } },
  VAELoader: { input: { required: { vae_name: [["test.vae.safetensors"]] } } },
  UpscaleModelLoader: { input: { required: { model_name: ["COMBO", { options: ["4x-UltraSharp.pth", "4x-UltraMix_Balanced.pth"] }] } } },
  ImageUpscaleWithModel: {}, ImageScale: {},
  CLIPSetLastLayer: {}, CLIPTextEncode: {}, EmptyLatentImage: {}, VAEDecode: {}, SaveImage: {},
};
const png = "data:image/png;base64," + readFileSync("tests/fixtures/parameters.png").toString("base64");
test.beforeEach(async ({ page }) => {
  let profiles: any[] = [], active = "", submissions: any[] = [];
  let items = ["lake.png", "forest.png", "mountain.png"].map((name, i) => ({ root: 0, relative: name, name, folder: "ComfyUI", modified: Date.now() - i, size: 123, favorite: false }));
  let trash: any[] = [];
  let modelFavorites: Record<string, string[]> = { checkpoints: [], loras: [] };
  await page.route("**/__native", async route => {
    const { command, args } = route.request().postDataJSON();
    let value: any = null;
    if (command === "restore") value = profiles.find(p => p.id === active)?.pairing.url ?? null;
    if (command === "list_profiles") value = profiles.map(p => ({ id: p.id, name: p.name, url: p.pairing.url, active: p.id === active }));
    if (command === "get_profile") value = profiles.find(p => p.id === args.id);
    if (command === "save_profile") {
      const id = args.id ?? "p" + profiles.length;
      profiles = [...profiles.filter(p => p.id !== id), { id, name: args.name, pairing: args.pairing }];
      if (id === active) active = "";
      value = id;
    }
    if (command === "activate_profile") { active = args.id; value = profiles.find(p => p.id === active).pairing.url; }
    if (command === "delete_profile") { profiles = profiles.filter(p => p.id !== args.id); if (active === args.id) active = ""; }
    if (command === "disconnect") active = "";
    if (command === "api") {
      const p = args.path, u = new URL(p, "https://test");
      if (p === "/api/system_stats") value = { system: { ram_total: 64 * 1024 ** 3, ram_free: 32 * 1024 ** 3 }, devices: [{ name: "RTX 4070 SUPER", vram_total: 12 * 1024 ** 3, vram_free: 9 * 1024 ** 3 }] };
      else if (p === "/api/object_info") value = info;
      else if (p === "/bridge/info") value = { version: 2, roots: [{ id: 0, name: "ComfyUI" }] };
      else if (p === "/bridge/model-favorites") { if (args.body) { const { kind, name, favorite } = args.body; modelFavorites[kind] = favorite ? [...modelFavorites[kind], name] : modelFavorites[kind].filter(n => n !== name); } value = modelFavorites; }
      else if (p === "/api/queue") value = { queue_running: [], queue_pending: [] };
      else if (p.startsWith("/bridge/events")) value = { events: [], seq: 0, connected: true };
      else if (p === "/api/prompt") { submissions.push(args.body); value = { prompt_id: "test-job-" + submissions.length }; }
      else if (p.startsWith("/api/history/")) {
        const id = p.split("/").pop()!;
        value = { [id]: { status: { completed: true, status_str: "success" }, outputs: { "7": { images: [{ filename: id + ".png", subfolder: "", type: "output" }] } } } };
      } else if (u.pathname === "/bridge/gallery") {
        const filtered = items.filter(i => (!u.searchParams.get("q") || i.name.includes(u.searchParams.get("q")!)) && (u.searchParams.get("favorite") !== "true" || i.favorite));
        value = { items: filtered, total: filtered.length, warnings: [] };
      } else if (p === "/bridge/favorite") {
        items = items.map(i => i.relative === args.body.relative ? { ...i, favorite: args.body.favorite } : i);
        value = { favorite: args.body.favorite };
      } else if (p === "/bridge/trash" && args.body) {
        const item = items.find(i => i.relative === args.body.relative)!;
        value = { ...item, id: item.name, deleted: Date.now() }; trash.push(value); items = items.filter(i => i !== item);
      } else if (p === "/bridge/trash") value = { items: trash };
      else if (p === "/bridge/restore") { const item = trash.find(i => i.id === args.body.id); items.push(item); trash = trash.filter(i => i !== item); value = {}; }
    }
    if (command === "image") value = png;
    if (command === "save_image") value = "Image enregistrée dans Photos / ComfyPocket";
    await route.fulfill({ json: { value } });
  });
});
async function openCards(page: Page) {
  for (const title of ["Votre création", "À votre mesure", "Aller plus loin"]) {
    const button = page.getByRole("button", { name: new RegExp(title) });
    if (await button.getAttribute("aria-expanded") === "false") await button.click();
  }
}
async function prompt(page: Page, text: string) { await openCards(page); await page.getByRole("button", { name: "Votre idée", exact: true }).click(); await page.getByLabel("Prompt positif", { exact: true }).fill(text); await page.getByRole("button", { name: "Terminé", exact: true }).click(); }
async function pairingForm(page: Page, name: string, url = cert.url) {
  await page.getByLabel("Nom de la connexion").fill(name);
  await page.getByText("Coller un fichier d’appairage", { exact: true }).click();
  await page.getByLabel("Ou collez son contenu").fill(JSON.stringify({ ...cert, url }));
}
async function connect(page: Page) {
  await page.goto("/");
  await pairingForm(page, "Maison");
  await page.getByRole("button", { name: "Connecter mon PC" }).click();
  await expect(page.getByRole("button", { name: "PC connecté" })).toBeVisible();
  await openCards(page);
}

test("advanced workflow, distinct batches and output at the top", async ({ page }) => {
  await connect(page);
  await prompt(page, "A cabin beside a lake");
  await page.getByLabel("Largeur", { exact: true }).fill("768");
  await page.getByLabel("Hauteur", { exact: true }).fill("512");
  await page.getByRole("button", { name: "Inverser largeur et hauteur" }).click();
  await expect(page.getByLabel("Largeur", { exact: true })).toHaveValue("512");
  await page.getByLabel("Seed", { exact: true }).fill("18446744073709551615");
  await page.getByLabel("Batches · nombre de lots", { exact: true }).fill("2");
  await page.getByRole("switch", { name: "Activer Hires Fix" }).check();
  await page.getByRole("switch", { name: "Activer Upscaler", exact: true }).check();
  const bodies: any[] = [];
  page.on("request", req => { if (req.url().endsWith("/__native")) { const data = req.postDataJSON(); if (data.args?.path === "/api/prompt") bodies.push(data.args.body); } });
  await page.getByRole("button", { name: "Générer l’image", exact: true }).click();
  await expect(page.getByText(/Génération terminée · 2 images/)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[0].prompt["5"].inputs.seed).toBe("18446744073709551615");
  expect(bodies[1].prompt["5"].inputs.seed).toBe(0);
  expect(Object.values(bodies[0].prompt).filter((n: any) => n.class_type === "KSampler")).toHaveLength(2);
  expect(bodies[0].extra_data.extra_pnginfo.comfy_pocket.settings.hires.enabled).toBe(true);
  expect(await page.locator(".output-panel").evaluate(el => !!(el.compareDocumentPosition(document.querySelector(".settings-grid")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.locator(".output-panel .image-button").first().click();
  await page.getByRole("button", { name: "Enregistrer sur cet appareil" }).click();
  await expect(page.getByText("Image enregistrée dans Photos / ComfyPocket")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("gallery swipe navigation, favorite, trash and restore", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Agrandir lake.png" }).click();
  const stage = page.locator(".viewer-stage");
  async function swipe(dx: number, dy: number) {
    const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up();
  }
  await swipe(-120, 0); await expect(page.locator(".viewer-caption")).toContainText("forest.png");
  await swipe(0, 140); await expect(page.getByRole("button", { name: "Retirer des favoris", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Retirer des favoris", exact: true })).toBeEnabled();
  await swipe(0, -150); await expect(page.locator(".viewer-caption")).toContainText("mountain.png");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Corbeille", exact: true }).click();
  await expect(page.locator(".trash-row")).toContainText("forest.png");
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await expect(page.getByText("La corbeille est vide.")).toBeVisible();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".gallery-card")).toHaveCount(1);
  await expect(page.locator(".gallery-card")).toContainText("forest.png");
});
test("JPEG metadata import and reuse from gallery preserve the seed", async ({ page }) => {
  await connect(page);
  await page.locator('input[accept*="image/jpeg"]').setInputFiles("tests/fixtures/parameters.jpg");
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("18446744073709551615");
  await expect(page.getByLabel("Votre idée")).toContainText("A quiet lake");
  await expect(page.locator(".output-panel img")).toHaveCount(1);
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Agrandir lake.png" }).click();
  await page.getByRole("button", { name: "Réutiliser les paramètres" }).click(); await openCards(page);
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("18446744073709551615");
  await expect(page.getByLabel("Largeur", { exact: true })).toHaveValue("768");
  await expect(page.locator(".import-summary")).toContainText("Paramètres PNG / EXIF");
});
test("model thumbnails, custom presets and invalid workflow", async ({ page }) => {
  await connect(page); await page.locator(".model-select").click();
  await expect(page.locator(".model-card img")).toHaveCount(2);
  await page.locator(".model-choice").filter({ hasText: "landscape" }).click();
  await expect(page.locator(".model-select")).toContainText("landscape");
  await page.getByLabel("Largeur", { exact: true }).fill("640");
  await page.getByText("Mes formats personnalisés", { exact: true }).click();
  await page.getByRole("button", { name: "Mémoriser ce format" }).click();
  await expect(page.locator(".preset-chip")).toContainText("640 × 1024");
  await page.getByRole("button", { name: "Générer l’image", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Décrivez");
  await page.getByRole("button", { name: "Workflow API", exact: true }).click();
  await page.locator(".card-heading button").filter({ hasText: "Workflow API" }).click();
  await page.getByLabel("Workflow JSON").fill('{"nodes":[]}');
  await page.getByRole("button", { name: "Valider les modifications" }).click();
  await expect(page.getByRole("alert")).toContainText("format API");
});
test("multiple editable connections survive disconnect and switching", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une connexion" }).click();
  await pairingForm(page, "WireGuard", "https://10.0.0.2:8189");
  await page.getByRole("button", { name: "Connecter mon PC" }).click();
  await expect(page.getByRole("button", { name: "PC connecté" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(page.locator(".profile-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Modifier WireGuard" }).click();
  await page.getByLabel("Adresse du PC").fill("https://10.0.0.3:8189");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".profile-card").filter({ hasText: "WireGuard" })).toContainText("10.0.0.3");
  await expect(page.getByRole("button", { name: "Non connecté" })).toBeVisible();
  await page.locator(".profile-card").filter({ hasText: "Maison" }).getByRole("button", { name: "Connecter", exact: true }).click();
  await expect(page.getByRole("button", { name: "PC connecté" })).toBeVisible();
  await prompt(page, "A lake");
  await page.getByRole("button", { name: "Générer l’image", exact: true }).click();
  await expect(page.getByText(/Génération terminée/)).toBeVisible();
});
test("light UI reflows and passes accessibility checks on narrow mobile and desktop", async ({ page }) => {
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await connect(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(page.locator(".gallery-card")).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Agrandir lake.png" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("prompt editor inserts offline suggestions in a bubble and preserves both tabs", async ({ page }) => {
  await connect(page);
  await page.getByRole("button", { name: "Votre idée", exact: true }).click();
  const positive = page.getByLabel("Prompt positif", { exact: true });
  await positive.fill("landsc");
  await expect(page.locator(".prompt-editor").getByRole("option").first()).toContainText("landscape");
  await expect(page.locator(".suggestion-bubble")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "../verification/v0.4/autocompletion.png" });
  expect((await page.locator(".suggestion-bubble").boundingBox())!.y).toBeGreaterThan((await positive.boundingBox())!.y);
  await page.locator(".prompt-editor").getByRole("option").first().click();
  await expect(positive).toHaveValue("landscape, ");
  await page.getByRole("tab", { name: /Négatif/ }).click();
  await page.getByRole("textbox", { name: "Prompt négatif", exact: true }).fill("blur");
  await expect(page.locator(".prompt-editor").getByRole("option").first()).toBeVisible();
  await page.locator(".prompt-editor").getByRole("option").first().click();
  await page.getByRole("tab", { name: /Positif/ }).click();
  await expect(positive).toHaveValue("landscape, ");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "../verification/v0.4/editeur.png" });
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await expect(page.getByRole("button", { name: "Votre idée", exact: true })).toContainText("landscape");
});

test("favorites persist for checkpoints and LoRAs and trained upscalers are selectable", async ({ page }) => {
  await connect(page); await page.locator(".model-select").click();
  await page.getByRole("button", { name: "Mettre en favori landscape", exact: true }).click();
  await page.getByRole("button", { name: "Favoris", exact: true }).click();
  await expect(page.locator(".model-card")).toHaveCount(1);
  await page.locator(".model-choice").click();
  await page.getByRole("button", { name: "LoRA / LyCORIS", exact: true }).click();
  await page.getByRole("button", { name: "Mettre en favori film", exact: true }).click();
  await page.locator(".model-choice").click();
  await page.getByRole("button", { name: "LoRA / LyCORIS", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirer des favoris film", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("switch", { name: "Activer Upscaler", exact: true }).check();
  await page.getByLabel("Upscaler final", { exact: true }).selectOption("model:4x-UltraSharp.pth");
  await expect(page.getByLabel("Upscaler final", { exact: true })).toHaveValue("model:4x-UltraSharp.pth");
});

test("complete named presets survive reload and restore inference parameters", async ({ page }) => {
  await connect(page); await prompt(page, "sunlight, landscape");
  await page.getByLabel("Seed", { exact: true }).fill("18446744073709551615");
  await page.getByRole("switch", { name: "Activer Hires Fix" }).check();
  await page.getByLabel("Facteur Hires Fix", { exact: true }).fill("1.75");
  await page.getByRole("button", { name: "Mes presets", exact: true }).click();
  await page.getByRole("button", { name: "Nouveau preset", exact: true }).click();
  await page.getByLabel("Titre du preset").fill("Mon paysage");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Charger Mon paysage" })).toBeVisible();
  await page.getByRole("button", { name: "Renommer Mon paysage" }).click();
  await page.getByLabel("Nouveau titre").fill("Matin au lac");
  await page.getByRole("button", { name: "Valider le titre" }).click();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await prompt(page, "forest"); await page.getByLabel("Seed", { exact: true }).fill("12");
  await page.reload();
  await page.getByRole("button", { name: "Mes presets", exact: true }).click();
  await page.getByRole("button", { name: "Charger Matin au lac" }).click(); await openCards(page);
  await expect(page.getByLabel("Seed", { exact: true })).toHaveValue("18446744073709551615");
  await expect(page.getByLabel("Facteur Hires Fix", { exact: true })).toHaveValue("1.75");
  await expect(page.getByRole("button", { name: "Votre idée", exact: true })).toContainText("sunlight, landscape");
});

test("reference glossary works offline, searches and inserts tags", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Glossaire", exact: true }).click();
  await expect(page.locator(".theme-card").filter({ hasText: "Lighting" })).toBeVisible();
  await page.locator(".theme-card").filter({ hasText: /^Lighting/ }).click();
  await page.getByText("Directional", { exact: true }).click();
  await expect(page.locator(".glossary-tag").filter({ hasText: "backlighting" })).toBeVisible();
  await page.getByLabel("Rechercher dans le glossaire").fill("sunlight");
  await page.locator(".glossary-tag").filter({ hasText: /^Lumière du soleil/ }).click();
  await page.getByRole("button", { name: "Positif", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("settings")!).positive)).toContain("sunlight");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Toutes les catégories" }).click();
  await page.getByLabel("Rechercher dans le glossaire").fill("uzumaki_naruto");
  await expect(page.getByText("Aucun tag trouvé", { exact: true })).toBeVisible();
});

test("gallery is fullscreen, preloads neighbours, pinches and resets zoom", async ({ page }) => {
  await connect(page); const originals: string[] = [];
  page.on("request", req => { if (req.url().endsWith("/__native")) { const d = req.postDataJSON(); if (d.command === "image" && !d.args.path.includes("thumb")) originals.push(d.args.path); } });
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Agrandir lake.png" }).click();
  const stage = page.locator(".viewer-stage");
  await expect(page.locator(".full-image")).toBeVisible();
  await expect.poll(() => originals.some(p => p.includes("forest.png"))).toBe(true);
  expect(await stage.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Image suivante" })).toHaveCount(0);
  await expect(page.locator(".viewer-actions button")).toHaveCount(4);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 145, y: 390, id: 1 }, { x: 245, y: 430, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 85, y: 350, id: 1 }, { x: 305, y: 470, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(1.5);
  await stage.dblclick({ position: { x: 190, y: 400 } });
  await expect(stage).toHaveAttribute("data-scale", "1.00");
});

test("horizontal page gestures navigate all four windows", async ({ page }) => {
  await connect(page);
  async function swipe() { await page.evaluate(() => scrollTo(0, 0)); const box = (await page.locator(".active-pane .page-heading").boundingBox())!; await page.mouse.move(box.x + box.width * .65, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 10, box.y + 20, { steps: 10 }); await page.mouse.up(); }
  await swipe(); await expect(page.getByRole("button", { name: "Galerie", exact: true })).toHaveAttribute("aria-current", "page");
  await page.locator(".gallery-toolbar").waitFor(); await swipe(); await expect(page.getByRole("button", { name: "Glossaire", exact: true })).toHaveAttribute("aria-current", "page");
  await page.locator(".theme-card").first().waitFor(); await swipe(); await expect(page.getByRole("button", { name: "Paramètres", exact: true })).toHaveAttribute("aria-current", "page");
});

test("icon dock, collapsed studio cards and persistent gallery density", async ({ page }) => {
  await connect(page); await page.reload();
  await expect(page.locator(".settings-grid")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  expect(await nav.locator("button").evaluateAll(buttons => buttons.map(b => b.getAttribute("aria-label")))).toEqual(["Créer", "Galerie", "Glossaire", "Paramètres"]);
  expect(await nav.innerText()).toBe("");
  const cards = page.locator(".collapsible-card");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    const button = card.locator(".card-heading button");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    expect(await card.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe("0px");
    await button.click(); await expect(card.locator(".card-content")).toBeVisible();
    await button.click(); await expect(card.locator(".card-content")).not.toBeVisible();
  }
  await page.screenshot({ path: "../verification/v0.4/creer-cartes.png" });
  await nav.getByRole("button", { name: "Galerie", exact: true }).click();
  for (const n of [2, 3, 4]) {
    await page.getByLabel("Nombre de colonnes").selectOption(String(n));
    expect(await page.locator(".gallery-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length)).toBe(n);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload(); await nav.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(nav.getByRole("button", { name: "Galerie", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Nombre de colonnes")).toHaveValue("4");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("v4 equal dock insets, white cards, concise headings and live PC resources", async ({ page }) => {
  await connect(page);
  await expect(page.getByRole("heading", { name: "Atelier", exact: true })).toBeVisible();
  expect(await page.locator(".page-heading p").count()).toBe(0);
  const inset = await page.locator(".sidebar").evaluate(el => {
    const rect = el.getBoundingClientRect(), buttons = el.querySelectorAll("nav button"), first = buttons[0].getBoundingClientRect(), last = buttons[3].getBoundingClientRect();
    return { left: first.left - rect.left, right: rect.right - last.right, top: first.top - rect.top };
  });
  expect(Math.abs(inset.left - inset.top)).toBeLessThan(1);
  expect(Math.abs(inset.right - inset.top)).toBeLessThan(1);
  const card = page.getByRole("button", { name: /01.*Votre création/ });
  await card.scrollIntoViewIfNeeded(); await card.hover(); await page.mouse.down();
  expect(await card.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  await page.mouse.up(); await card.click();
  const order = await page.locator(".settings-grid").evaluate(el => {
    const model = el.querySelector(".model-select")!, loras = Array.from(el.querySelectorAll("button")).find(b => b.textContent?.includes("LoRA / LyCORIS"))!, prompt = el.querySelector(".prompt-entry")!;
    return !!(model.compareDocumentPosition(loras) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(loras.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING);
  }); expect(order).toBe(true);
  await page.getByRole("button", { name: "PC connecté", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "État du PC" });
  await expect(dialog.getByText("192.168.1.8", { exact: true })).toBeVisible();
  await expect(dialog.getByText("8189", { exact: true })).toBeVisible();
  await expect(dialog.getByText("RTX 4070 SUPER", { exact: true })).toBeVisible();
  await expect(dialog.getByText("32 Go", { exact: true })).toBeVisible();
  await expect(dialog.getByText("9 Go", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "../verification/v0.4/etat-pc.png" });
});

test("v4 autocomplete frame persists while typing and can be disabled", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Votre idée", exact: true }).click();
  const field = page.getByLabel("Prompt positif", { exact: true });
  await field.fill("land"); await expect(page.locator(".suggestion-bubble")).toHaveAttribute("aria-busy", "false");
  await page.locator(".suggestion-bubble").evaluate(el => {
    (window as any).bubbleNode = el; (window as any).bubbleHidden = false;
    (window as any).bubbleObserver = new MutationObserver(() => { if ((el as HTMLElement).hidden) (window as any).bubbleHidden = true; });
    (window as any).bubbleObserver.observe(el, { attributes: true, attributeFilter: ["hidden"] });
  });
  await field.pressSequentially("sc", { delay: 90 });
  await expect(page.locator(".suggestion-bubble")).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => (window as any).bubbleNode === document.querySelector(".suggestion-bubble") && !(window as any).bubbleHidden)).toBe(true);
  await page.evaluate(() => (window as any).bubbleObserver.disconnect());
  await page.locator(".prompt-editor").getByRole("option").first().click();
  await expect(field).toHaveValue("landscape, ");
  await page.getByRole("switch", { name: "Activer l’autocomplétion" }).uncheck();
  await field.fill("lands"); await expect(page.locator(".suggestion-bubble")).not.toBeVisible();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.getByRole("button", { name: "Votre idée", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Activer l’autocomplétion" })).not.toBeChecked();
  await page.getByRole("switch", { name: "Activer l’autocomplétion" }).check();
  await expect(page.locator(".prompt-editor").getByRole("option").first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("v4 presets occupy a page with a separate create dialog and spaced undo", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Mes presets", exact: true }).click();
  expect(await page.locator(".presets-page").boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(page.getByLabel("Titre du preset")).toHaveCount(0);
  await page.getByRole("button", { name: "Nouveau preset", exact: true }).click();
  await page.getByLabel("Titre du preset").fill("Lumière du matin");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.getByRole("button", { name: "Supprimer le preset Lumière du matin" }).click();
  const search = (await page.getByLabel("Rechercher un preset").boundingBox())!, undo = (await page.getByRole("button", { name: "Annuler la suppression" }).boundingBox())!;
  expect(undo.y - (search.y + search.height)).toBeGreaterThan(30);
  await page.getByRole("button", { name: "Annuler la suppression" }).click();
  await expect(page.getByRole("button", { name: "Charger Lumière du matin" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "../verification/v0.4/presets.png" });
});

test("v4 long press selects multiple images for favorite download and recoverable trash", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  const calls: any[] = []; page.on("request", req => { if (req.url().endsWith("/__native")) calls.push(req.postDataJSON()); });
  const first = page.getByRole("button", { name: "Agrandir lake.png", exact: true }); await first.hover(); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up();
  await expect(page.locator(".photo-viewer")).toHaveCount(0);
  await expect(page.locator(".batch-toolbar")).toContainText("1 sélectionnée");
  await page.getByRole("button", { name: "Sélectionner forest.png", exact: true }).click();
  await expect(page.locator(".batch-toolbar")).toContainText("2 sélectionnée");
  await page.getByRole("button", { name: "Mettre la sélection en favori" }).click();
  await expect(page.getByRole("button", { name: "Télécharger la sélection" })).toBeEnabled();
  expect(calls.filter(c => c.args?.path === "/bridge/favorite")).toHaveLength(2);
  await page.getByRole("button", { name: "Télécharger la sélection" }).click();
  await expect.poll(() => calls.filter(c => c.command === "save_image").length).toBe(2);
  await expect(page.getByRole("button", { name: "Supprimer la sélection" })).toBeEnabled();
  await page.screenshot({ path: "../verification/v0.4/selection.png" });
  await page.getByRole("button", { name: "Supprimer la sélection" }).click();
  await expect(page.locator(".gallery-card")).toHaveCount(1);
  await expect(page.locator(".batch-toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Corbeille", exact: true }).click();
  await expect(page.locator(".trash-row")).toHaveCount(2);
});

test("v4 vertical gesture feedback and decoded neighbour survive image handoff", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Agrandir lake.png", exact: true }).click();
  const stage = page.locator(".viewer-stage");
  await expect(page.locator(".adjacent-image")).toHaveCount(1);
  await page.locator(".adjacent-image").evaluate(el => (el as HTMLElement).dataset.decodedIdentity = "next");
  await page.mouse.move(190, 400); await page.mouse.down(); await page.mouse.move(190, 460, { steps: 6 });
  await expect(page.locator(".gesture-action")).toHaveAttribute("data-action", "favorite"); await expect(page.locator(".gesture-action")).toBeVisible();
  await page.mouse.move(190, 340, { steps: 6 });
  await expect(page.locator(".gesture-action")).toHaveAttribute("data-action", "trash");
  await page.screenshot({ path: "../verification/v0.4/geste-corbeille.png" });
  await page.mouse.up(); await page.waitForTimeout(250);
  await page.mouse.move(280, 400); await page.mouse.down(); await page.mouse.move(100, 400, { steps: 10 }); await page.mouse.up();
  await expect(page.locator(".viewer-caption")).toContainText("forest.png");
  await expect(page.locator(".full-image")).toHaveAttribute("data-decoded-identity", "next");
  expect(await stage.locator(".viewer-rail").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBe(0);
  await expect(page.locator(".gesture-action")).not.toBeVisible();
});

test("v4 gallery refresh does not shift the grid and notices are transient overlays", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Galerie", exact: true })).toHaveAttribute("aria-current", "page");
  const y = (await page.locator(".gallery-grid").boundingBox())!.y;
  await page.route("**/__native", async route => { const d = route.request().postDataJSON(); if (d.args?.path?.startsWith("/bridge/gallery")) await new Promise(r => setTimeout(r, 450)); await route.fallback(); });
  await page.getByRole("button", { name: "Actualiser la galerie" }).click();
  await expect(page.getByRole("button", { name: "Actualiser la galerie" })).toBeDisabled();
  expect((await page.locator(".gallery-grid").boundingBox())!.y).toBe(y);
  await expect(page.getByText("Chargement de la collection…", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualiser la galerie" })).toBeEnabled();
  expect((await page.locator(".gallery-grid").boundingBox())!.y).toBe(y);
  await expect(page.locator(".page-heading + .notice,.page-heading + .alert")).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 7000 });
});

test("v4 page slides preserve form nodes and keep neighbours outside the settled viewport", async ({ page }) => {
  await connect(page);
  await page.getByLabel("Steps", { exact: true }).evaluate(el => (el as HTMLElement).dataset.preserved = "yes");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["Galerie", "Glossaire", "Paramètres", "Créer"]) {
      const tab = page.getByRole("button", { name, exact: true }); await tab.click();
      await expect(tab).toHaveAttribute("aria-current", "page");
      const outside = await page.evaluate(() => {
        const bounds = document.querySelector("main")!.getBoundingClientRect();
        return [...document.querySelectorAll(".page-pane[inert]")].every(el => {
          const b = el.getBoundingClientRect(); return b.right <= bounds.left + 1 || b.left >= bounds.right - 1;
        });
      });
      expect(outside).toBe(true);
    }
  }
  await expect(page.getByLabel("Steps", { exact: true })).toHaveAttribute("data-preserved", "yes");
  await expect(page.getByRole("button", { name: /Votre création/ })).toHaveAttribute("aria-expanded", "true");
  // A quick second tap must win instead of being lost while the first animation runs.
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(page.getByRole("button", { name: "Paramètres", exact: true })).toHaveAttribute("aria-current", "page");
});

test("v4 cancelled long press does not select and failed batch items can be retried alone", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  const photo = page.getByRole("button", { name: "Agrandir lake.png", exact: true });
  await photo.dispatchEvent("pointerdown", { pointerId: 1, button: 0, clientX: 60, clientY: 400 });
  await photo.dispatchEvent("pointermove", { pointerId: 1, clientX: 60, clientY: 440 });
  await page.waitForTimeout(500); await photo.dispatchEvent("pointercancel", { pointerId: 1 });
  await expect(page.locator(".batch-toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Sélectionner", exact: true }).click();
  await page.getByRole("button", { name: "Tout sélectionner", exact: true }).click();
  let fail = true; const attempts: string[] = [];
  await page.route("**/__native", async route => {
    const d = route.request().postDataJSON();
    if (d.args?.path === "/bridge/favorite") {
      attempts.push(d.args.body.relative);
      if (d.args.body.relative === "forest.png" && fail) { await route.fulfill({ json: { error: "Connection interrupted" } }); return; }
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Mettre la sélection en favori" }).click();
  await expect(page.locator(".batch-error")).toContainText("1 action(s)");
  await expect(page.locator(".batch-toolbar strong")).toHaveText("1 sélectionnée(s)");
  expect(attempts).toEqual(["lake.png", "forest.png", "mountain.png"]);
  fail = false; await page.getByRole("button", { name: "Mettre la sélection en favori" }).click();
  await expect(page.locator(".batch-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mettre la sélection en favori" })).toBeEnabled();
  expect(attempts).toEqual(["lake.png", "forest.png", "mountain.png", "forest.png"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("v4 viewer loads and decodes the next page before handing off the image", async ({ page }) => {
  await page.route("**/__native", async route => {
    const d = route.request().postDataJSON();
    if (d.args?.path?.startsWith("/bridge/gallery")) {
      const offset = new URL(d.args.path, "https://test").searchParams.get("offset");
      await route.fulfill({ json: { value: { items: [{ root: 0, relative: offset === "1" ? "next.png" : "first.png", name: offset === "1" ? "next.png" : "first.png", folder: "ComfyUI", favorite: false, modified: Date.now(), size: 123 }], total: 2, warnings: [] } } }); return;
    }
    await route.fallback();
  });
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await page.getByRole("button", { name: "Agrandir first.png", exact: true }).click();
  await expect(page.locator(".full-image")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".viewer-caption")).toContainText("next.png");
  expect(await page.locator(".full-image").evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(await page.locator(".viewer-rail").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41)).toBe(0);
});

test("v4 returning to the gallery discovers images created since the previous visit", async ({ page }) => {
  await connect(page); await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agrandir lake.png", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await expect(page.getByRole("button", { name: "Créer", exact: true })).toHaveAttribute("aria-current", "page");
  await page.route("**/__native", async route => {
    if (route.request().postDataJSON().args?.path?.startsWith("/bridge/gallery")) {
      await route.fulfill({ json: { value: { items: [{ root: 0, relative: "new.png", name: "new.png", folder: "ComfyUI", favorite: false, modified: Date.now(), size: 123 }], total: 1, warnings: [] } } }); return;
    }
    await route.fallback();
  });
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Agrandir new.png", exact: true })).toBeVisible();
});
