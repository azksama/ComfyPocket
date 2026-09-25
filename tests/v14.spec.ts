import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const html = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Mochi feature test</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/v14-harness.tsx');</script></body></html>`;
test.beforeEach(async ({ page }) => {
  await page.route("**/__v14**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
});
test("convert free text, disable a block and weight a tag from its editor", async ({
  page,
}) => {
  await page.goto("/__v14");
  await page.getByRole("button", { name: "Blocs", exact: true }).click();
  await page.getByRole("button", { name: "Transformer en bloc" }).click();
  await page.getByLabel("Nom du bloc 1").fill("Body");
  await page
    .getByRole("switch", { name: "Activer Body", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Texte", exact: true }).click();
  await expect(page.getByLabel("Prompt positif", { exact: true })).toHaveValue(
    "## [off] Body\nbed, blue_eyes,\n##",
  );
  await page.getByRole("button", { name: "Blocs", exact: true }).click();
  await page.getByRole("switch", { name: "Activer Body", exact: true }).check();
  await page.getByRole("button", { name: "Modifier le texte de Body" }).click();
  const edit = page.getByRole("dialog", { name: "Body", exact: true });
  await expect(
    edit.getByRole("button", { name: "Assistant vocal", exact: true }),
  ).toBeVisible();
  const field = edit.getByRole("textbox", {
    name: "Texte du bloc",
    exact: true,
  });
  await field.click();
  await field.press("Control+Home");
  await edit.getByRole("button", { name: "Poids du tag" }).click();
  const weight = page.getByRole("dialog", { name: "Poids du tag" });
  await weight.getByRole("spinbutton").fill("1.5");
  await weight.getByRole("button", { name: "Appliquer" }).click();
  await expect(field).toHaveValue("(bed:1.5), blue_eyes,");
  await edit
    .getByRole("button", { name: "Annuler la dernière modification" })
    .click();
  await expect(field).toHaveValue("bed, blue_eyes,");
  await edit.getByRole("button", { name: "Terminé", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "../verification/v0.14.0/blocks.png" });
});
test("updates require consent before downloading and Android installation is explicit", async ({
  page,
}) => {
  const actions: string[] = [];
  let phase = "idle",
    ready = false,
    canInstall = false;
  await page.route("**/__native", async (r) => {
    const d = r.request().postDataJSON();
    actions.push(d.args.action);
    if (d.args.action === "download") {
      ready = true;
      phase = "ready";
    }
    if (d.args.action === "install") canInstall = true;
    await r.fulfill({
      json: {
        value: {
          supported: true,
          phase,
          available: true,
          release: { version: "9.0.0", size: 1000 },
          ready,
          received: ready ? 1000 : 0,
          canInstall,
        },
      },
    });
  });
  await page.goto("/__v14?update");
  await page
    .getByRole("button", { name: "Rechercher une mise à jour" })
    .click();
  await expect(
    page.getByRole("button", { name: "Télécharger la mise à jour" }),
  ).toBeVisible();
  expect(actions).not.toContain("download");
  await page
    .getByRole("button", { name: "Télécharger la mise à jour" })
    .click();
  expect(actions).not.toContain("install");
  await page.getByRole("button", { name: "Autoriser l’installation" }).click();
  await expect(
    page.getByRole("button", { name: "Installer la mise à jour" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Installer la mise à jour" }).click();
  expect(actions.filter((a) => a === "install")).toHaveLength(2);
  await page.screenshot({ path: "../verification/v0.14.0/update.png" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("voice models stay on the PC and dictation produces reviewable tags", async ({
  page,
}) => {
  const actions: string[] = [];
  let ready = false,
    taggerReady = false,
    phase = "idle";
  await page.route("**/__native", async (r) => {
    const d = r.request().postDataJSON();
    let value: unknown = null;
    if (d.command === "voice_action") {
      actions.push("native:" + d.args.action);
      if (d.args.action === "start") phase = "recording";
      if (d.args.action === "stop") phase = "complete";
      if (d.args.action === "cancel") phase = "idle";
      value = {
        supported: true,
        phase,
        audio: d.args.action === "take" ? "AAAA" : undefined,
      };
    } else if (d.command === "api") {
      const path = d.args.path,
        b = d.args.body;
      if (path === "/bridge/assistant")
        value = {
          supported: true,
          runtimeReady: true,
          ready,
          taggerReady,
          phase: "idle",
          model: "medium",
          device: "auto",
          models: [
            { id: "medium", size: 3059917072, installed: ready },
            { id: "danbot", size: 837847444, installed: taggerReady },
          ],
        };
      if (path === "/bridge/assistant/jobs") {
        actions.push("pc:" + b.action + ":" + (b.target || ""));
        if (b.action === "download") {
          if (b.target === "whisper") ready = true;
          else taggerReady = true;
          value = { id: "download", phase: "complete" };
        }
        if (b.action === "transcribe")
          value = {
            id: "speech",
            phase: "complete",
            text: "A girl with blue eyes.",
          };
        if (b.action === "optimize")
          value = {
            id: "tags",
            phase: "complete",
            blocks: [
              { title: "DanbotNL", side: "positive", text: "1girl, blue_eyes" },
            ],
          };
      }
    }
    await r.fulfill({ json: { value } });
  });
  await page.goto("/__v14");
  await page
    .getByRole("button", { name: "Assistant vocal", exact: true })
    .click();
  const voice = page.getByRole("dialog", {
    name: "Assistant vocal",
    exact: true,
  });
  await voice.getByRole("button", { name: "Dicter", exact: true }).click();
  const models = page.getByRole("dialog", {
    name: "Voix et modèles",
    exact: true,
  });
  await expect(models.getByText("DanbotNL · 260M")).toBeVisible();
  expect(actions.some((a) => a.includes("download"))).toBe(false);
  await models
    .getByRole("article")
    .filter({ hasText: "Whisper medium" })
    .getByRole("button", { name: "Télécharger sur le PC" })
    .click();
  await expect(
    models
      .getByRole("article")
      .filter({ hasText: "Whisper medium" })
      .getByText("Installé sur le PC"),
  ).toBeVisible();
  await models
    .getByRole("article")
    .filter({ hasText: "DanbotNL" })
    .getByRole("button", { name: "Télécharger sur le PC" })
    .click();
  await expect(models.getByText("Installé sur le PC")).toHaveCount(2);
  await models.getByRole("button", { name: "Fermer", exact: true }).click();
  await voice.getByRole("button", { name: "Dicter", exact: true }).click();
  await voice.getByRole("button", { name: "Terminer la dictée" }).click();
  await expect(voice.getByLabel("Décrivez votre idée")).toHaveValue(
    "A girl with blue eyes.",
  );
  await expect(
    voice.getByText("Vérifier avant d’insérer", { exact: true }),
  ).toBeVisible();
  expect(actions).not.toContain("native:download");
  expect(actions).toContain("pc:transcribe:");
  expect(actions).toContain("pc:optimize:");
  await page.screenshot({ path: "../verification/v0.14.0/voice.png" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
