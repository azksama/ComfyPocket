import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const html = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Catalog test</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/catalog-harness.tsx');</script></body></html>`;
test.beforeEach(async ({ page }) => {
  await page.route("**/__catalog**", (r) =>
    r.fulfill({ contentType: "text/html", body: html }),
  );
  await page.route("**/__native", (r) => {
    const d = r.request().postDataJSON(),
      p = d.args?.path || "";
    let value: any = {};
    if (p.startsWith("/bridge/model-info"))
      value = { baseModel: "Illustrious" };
    if (p === "/bridge/model-metadata")
      value = {
        items: [
          { name: "illust.safetensors", baseModel: "Illustrious" },
          { name: "pony.safetensors", baseModel: "Pony" },
          { name: "unknown.safetensors", baseModel: "" },
        ],
      };
    if (p === "/bridge/civitai/search")
      value = {
        items: [
          {
            id: 1,
            title: "Watercolor",
            type: "LORA",
            creator: "Artist",
            preview: "",
            versions: [
              {
                id: 11,
                name: "IL",
                baseModel: "Illustrious",
                url: "https://civitai.red/models/1?modelVersionId=11",
              },
              {
                id: 12,
                name: "SDXL",
                baseModel: "SDXL 1.0",
                url: "https://civitai.red/models/1?modelVersionId=12",
              },
            ],
          },
        ],
        cursor: null,
      };
    if (p === "/bridge/imports/inspect")
      value = {
        id: "plan",
        title: "Watercolor",
        provider: "civitai",
        files: [
          {
            id: "file",
            name: "style.safetensors",
            label: "IL",
            kind: "loras",
            size: 1024,
            baseModel: "Illustrious",
          },
        ],
      };
    return r.fulfill({ json: { value } });
  });
});
test("filters LoRAs by declared family with an explicit unknown fallback", async ({
  page,
}) => {
  await page.goto("/__catalog?loras");
  await expect(page.locator(".model-choice")).toHaveCount(1);
  await expect(page.locator(".model-choice")).toContainText(
    "illust.safetensors",
  );
  await page.getByRole("button", { name: "Voir tous les LoRA" }).click();
  await expect(page.locator(".model-choice")).toHaveCount(3);
  await page.getByRole("button", { name: "Afficher les compatibles" }).click();
  await expect(page.locator(".model-choice")).toHaveCount(1);
  await page.screenshot({
    path: "../verification/v0.15.0/lora-compatibility.png",
  });
});
test("browse Civitai versions then confirm a PC installation", async ({
  page,
}) => {
  let selected = "";
  page.on("request", (r) => {
    if (r.url().endsWith("/__native")) {
      const d = r.postDataJSON();
      if (d.args?.path === "/bridge/imports/inspect")
        selected = d.args.body.url;
    }
  });
  await page.goto("/__catalog");
  await page
    .getByRole("combobox", { name: "Site", exact: true })
    .selectOption("civitai.red");
  await page
    .getByRole("combobox", { name: "Modèle de base", exact: true })
    .selectOption("Illustrious");
  await page.getByRole("button", { name: "Rechercher", exact: true }).click();
  await expect(page.getByText("Watercolor", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "../verification/v0.15.0/civitai-browser.png",
  });
  await page.getByRole("button", { name: "Choisir les fichiers" }).click();
  await expect(page.getByLabel("Installer comme")).toHaveValue("loras");
  expect(selected).toBe("https://civitai.red/models/1?modelVersionId=11");
  await page.getByRole("button", { name: "Télécharger et installer" }).click();
  await expect(page.locator(".import-plan")).toHaveCount(0);
});
