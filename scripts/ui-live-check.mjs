import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import https from "node:https";
const pairing = JSON.parse(await readFile(process.argv[2], "utf8")), out = process.argv[3];
await mkdir(out, { recursive: true });
function call(route, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(route, pairing.url), {
      ca: pairing.certificate, method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + pairing.token, ...(body ? { "Content-Type": "application/json" } : {}) },
    }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => {
        const b = Buffer.concat(chunks);
        if (res.statusCode >= 400) return reject(Error("HTTP " + res.statusCode));
        resolve(res.headers["content-type"]?.includes("json") ? JSON.parse(b) : "data:" + res.headers["content-type"] + ";base64," + b.toString("base64"));
      });
    });
    req.on("error", reject); req.end(body ? JSON.stringify(body) : undefined);
  });
}
const testPrefix = "ComfyPocket_QA_v040_" + Date.now();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const errors = [], submissions = [], previewRequests = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/__native", async route => {
    try {
      const { command, args } = route.request().postDataJSON(); let value = null;
      if (command === "restore") value = pairing.url;
      if (command === "list_profiles") value = [{ id: "pc", name: "Mon atelier", url: pairing.url, active: true }];
      if (command === "api") {
        if (args.path === "/api/prompt") for (const node of Object.values(args.body.prompt)) if (node.class_type === "SaveImage") node.inputs.filename_prefix = "ComfyPocket/" + testPrefix;
        value = await call(args.path, args.body); if (args.path === "/api/prompt") submissions.push({ id: value.prompt_id, graph: args.body.prompt, settings: args.body.extra_data?.extra_pnginfo?.comfy_pocket?.settings }); }
      if (command === "image") { value = await call(args.path); if (args.path.startsWith("/bridge/model-preview")) previewRequests.push(args.path); }
      await route.fulfill({ json: { value } });
    } catch (e) { await route.fulfill({ json: { error: e.message } }); }
  });
  await page.goto("http://127.0.0.1:1420");
  try { await page.getByRole("button", { name: "PC connecté" }).waitFor(); } catch(e) { console.log("CONNECT ERROR", await page.locator("[role=alert]").allTextContents(), errors); await page.screenshot({path:out+"/connect-error.png"}); throw e; }
  for (const title of ["Votre création", "À votre mesure", "Aller plus loin"]) { const card = page.getByRole("button", { name: new RegExp(title) }); if (await card.getAttribute("aria-expanded") !== "true") await card.click(); }
  await page.locator(".model-select").click();
  await page.getByLabel("Rechercher un modèle").fill("dreamshaper_8");
  await page.locator(".model-choice").first().click();
  await page.getByRole("button", { name: "Votre idée", exact: true }).click();
  await page.getByLabel("Prompt positif", { exact: true }).fill("A small wooden cabin beside a pristine alpine lake, pine trees, delicate morning mist, warm golden sunlight, cinematic landscape photography, no people");
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await page.getByLabel("Largeur", { exact: true }).fill("512");
  await page.getByLabel("Hauteur", { exact: true }).fill("512");
  await page.getByLabel("Steps", { exact: true }).fill("12");
  await page.getByLabel("Seed", { exact: true }).fill("18446744073709551614");
  await page.getByLabel("Batches · nombre de lots", { exact: true }).fill("2");
  await page.getByRole("switch", { name: "Activer Hires Fix" }).check();
  await page.getByLabel("Facteur Hires Fix", { exact: true }).fill("1.5");
  await page.getByLabel("Steps Hires Fix", { exact: true }).fill("8");
  await page.getByRole("switch", { name: "Activer Upscaler", exact: true }).check();
  await page.getByLabel("Upscaler final", { exact: true }).selectOption("model:4x-UltraMix_Balanced.pth");
  await page.getByLabel("Facteur Upscaler", { exact: true }).fill("1.5");
  await page.getByRole("button", { name: "Générer l’image", exact: true }).click();
  await Promise.race([
    page.getByText("Génération terminée · 2 images", { exact: true }).waitFor({ timeout: 180000 }),
    page.getByRole("alert").waitFor({ timeout: 180000 }).then(async () => { throw Error(await page.getByRole("alert").innerText()); })
  ]);
  await expect(page.locator(".output-panel .output-image img")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: out + "/mobile-atelier.png" });
  await page.screenshot({ path: out + "/mobile-parametres.png", fullPage: true });
  const contrast = await new AxeBuilder({ page }).analyze();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: out + "/desktop-atelier.png", fullPage: true });
  await page.getByRole("button", { name: "Galerie", exact: true }).click();
  await expect(page.getByRole("button", { name: "Galerie", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Rechercher dans la galerie").fill(testPrefix);
  await expect(page.getByLabel("Rechercher dans la galerie")).toHaveValue(testPrefix);
  await expect(page.locator(".gallery-card")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/mobile-galerie.png" });
  await page.locator(".gallery-card .image-button").first().click();
  await page.locator(".full-image").waitFor();
  await page.screenshot({ path: out + "/plein-ecran.png" });
  const file = await page.locator(".viewer-caption span").last().textContent();
  if (!file.startsWith(testPrefix)) throw Error("Only the newly generated test image may be modified.");
  await page.getByRole("button", { name: "Mettre en favori", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retirer des favoris", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Déplacer dans la corbeille", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Annuler la suppression" }).click();
  await page.getByRole("button", { name: "Agrandir " + file, exact: true }).click();
  await page.getByRole("button", { name: "Réutiliser les paramètres" }).click();
  for (const title of ["Votre création", "À votre mesure", "Aller plus loin"]) { const card = page.getByRole("button", { name: new RegExp(title) }); if (await card.getAttribute("aria-expanded") !== "true") await card.click(); }
  const importedSeed = await page.getByLabel("Seed", { exact: true }).inputValue();
  if (!["18446744073709551614", "18446744073709551615"].includes(importedSeed)) throw Error("Seed import mismatch: " + importedSeed);
  await expect(page.getByRole("switch", { name: "Activer Hires Fix" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Activer Upscaler", exact: true })).toBeChecked();
  const histories = await Promise.all(submissions.map(s => call("/api/history/" + s.id)));
  const proof = { testPrefix, generatedAt: new Date().toISOString(), transport: "Real HTTPS companion and ComfyUI; browser native-command adapter", submissions: submissions.map(s => ({ id: s.id, settings: s.settings, nodes: Object.values(s.graph).map(n => n.class_type) })), importedSeed, modelPreviewsLoaded: previewRequests.length, favoritesTrashRestore: true, errors, accessibilityViolations: contrast.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), historyStatuses: histories.map((h, i) => h[submissions[i].id]?.status) };
  await writeFile(out + "/live-ui-proof.json", JSON.stringify(proof, null, 2));
  if (errors.length || contrast.violations.length || !previewRequests.length) throw Error("Verification failures: see proof.");
  console.log("Live HTTPS/GPU: two hires + upscale images; uint64 seed import; real previews; favorite, trash and restore passed.");
} finally { await browser.close(); }
