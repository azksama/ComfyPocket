import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const harness = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Prompt editor</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/tests/prompt-harness.tsx');
</script></body></html>`;

test.beforeEach(async ({ page }) => {
  await page.route("**/__prompt-editor", (route) =>
    route.fulfill({ contentType: "text/html", body: harness }),
  );
});

test("history storage failure offers a safe close without losing the applied prompt", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "prompt-history-v1")
        throw new DOMException("Full", "QuotaExceededError");
      write.call(this, key, value);
    };
  });
  await page.goto("/__prompt-editor");
  await page
    .getByLabel("Prompt positif", { exact: true })
    .fill("mountain lake");
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Vos prompts restent appliqués.",
  );
  await page.getByRole("button", { name: "Fermer sans historique" }).click();
  await expect(page.getByRole("status")).toHaveText("Appliqué : mountain lake");
});

test("autocomplete preference remains usable when device storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "autocomplete-enabled")
        throw new DOMException("Unavailable", "SecurityError");
      write.call(this, key, value);
    };
  });
  await page.goto("/__prompt-editor");
  await page
    .getByRole("switch", { name: "Activer l’autocomplétion" })
    .uncheck();
  await expect(page.getByRole("status")).toContainText(
    "Ce choix s’applique pour cette session",
  );
  await page.getByLabel("Prompt positif", { exact: true }).fill("landscape");
  await expect(page.locator(".suggestion-bubble")).toBeHidden();
  await page.getByRole("button", { name: "Terminé", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Appliqué : landscape");
});

test("library search has a recoverable empty state and deleting a block can be undone", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "prompt-blocks-v1",
      JSON.stringify([
        {
          id: "light",
          title: "Lumière",
          positive: "soft_light",
          negative: "",
          at: 1,
        },
      ]),
    ),
  );
  await page.goto("/__prompt-editor");
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  const search = page.getByRole("searchbox", {
    name: "Rechercher dans les prompts",
  });
  await search.fill("lumiere");
  await expect(page.getByRole("heading", { name: "Lumière" })).toBeVisible();
  await search.fill("unmatched");
  await expect(
    page.getByText("Aucun prompt ne correspond à votre recherche."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Effacer la recherche" }).click();
  await page.getByRole("button", { name: "Supprimer Lumière" }).click();
  await expect(
    page.getByText("Créez votre premier bloc : éclairage, style, composition…"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lumière" })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("prompt-blocks-v1")!).length,
    ),
  ).toBe(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../verification/refactor/prompt-library.png",
  });
});

test("prompt controls remain reachable on a narrow keyboard-sized viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 317 });
  await page.goto("/__prompt-editor");
  await page.getByLabel("Prompt positif", { exact: true }).fill("landsc");
  await expect(page.getByRole("option").first()).toContainText("landscape");
  const complete = await page
    .getByRole("button", { name: "Terminé", exact: true })
    .boundingBox();
  expect(complete!.y + complete!.height).toBeLessThanOrEqual(317);
  const field = await page
    .getByLabel("Prompt positif", { exact: true })
    .boundingBox();
  expect(field!.width).toBeLessThanOrEqual(320);
  const paper = await page.locator(".editor-paper").boundingBox();
  expect(field!.y + field!.height).toBeLessThanOrEqual(paper!.y + paper!.height + 1);
  expect(paper!.y + paper!.height).toBeLessThan(complete!.y);
  const bubble = await page.locator(".suggestion-bubble").boundingBox();
  expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(paper!.y + paper!.height + 1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../verification/refactor/prompt-editor-compact.png",
  });
});

test("English block controls preserve free text and restore a removed section", async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('mochi-language','en'));
  await page.goto('/__prompt-editor');
  await page.getByLabel('Positive prompt',{exact:true}).fill('quality,\n\n## Body\nred_dress,\n##');
  await page.getByRole('button',{name:'Blocks',exact:true}).click();
  const title = page.getByLabel('Block 2 name');
  await expect(title).toHaveValue('Body');
  const label = page.locator('.part-title').first();
  const marker = await label.locator('span').boundingBox();
  const field = await title.boundingBox();
  expect(Math.abs(marker!.y + marker!.height/2 - field!.y - field!.height/2)).toBeLessThan(2);
  await page.getByRole('button',{name:'Remove Body from the prompt',exact:true}).click();
  await expect(page.locator('.prompt-part')).toHaveCount(1);
  await page.getByRole('button',{name:'Undo last change',exact:true}).click();
  await expect(page.locator('.prompt-part')).toHaveCount(2);
  await page.getByRole('button',{name:'Text',exact:true}).click();
  await expect(page.getByLabel('Positive prompt',{exact:true})).toHaveValue('quality,\n\n## Body\nred_dress,\n##');
  await page.getByRole('button',{name:'Voice assistant',exact:true}).click();
  await expect(page.getByText('Waiting for the model',{exact:true})).toBeVisible();
});
