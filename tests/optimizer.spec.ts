import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const harness = `<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Optimizer integration test</title></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/tests/optimizer-harness.tsx');
</script></body></html>`;

test.beforeEach(async ({ page }) => {
  await page.route("**/__prompt-assistant", (route) =>
    route.fulfill({ contentType: "text/html", body: harness }),
  );
  await page.goto("/__prompt-assistant");
  await page
    .getByLabel("Décrivez votre idée")
    .fill("Une fille aux yeux bleus sur une plage");
});

test("future optimizer cancels stale responses and inserts only reviewed selected blocks", async ({
  page,
}) => {
  const propose = page.getByRole("button", {
    name: "Proposer des tags",
    exact: true,
  });
  await propose.click();
  await expect(page.getByText("Préparation des blocs…")).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  expect(await page.evaluate(() => window.optimizerTest.signal?.aborted)).toBe(
    true,
  );
  await page.evaluate(() =>
    window.optimizerTest.resolve?.({
      blocks: [{ title: "Stale", text: "old", side: "positive" }],
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Vérifier avant d’insérer" }),
  ).toHaveCount(0);
  await propose.click();
  await page.evaluate(() =>
    window.optimizerTest.resolve?.({
      blocks: [
        { title: "Body", text: "blue_eyes,", side: "positive" },
        { title: "Avoid", text: "blur,", side: "negative" },
      ],
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Vérifier avant d’insérer" }),
  ).toBeVisible();
  await page.getByLabel("Tags proposés").first().fill("blue_eyes, white_hair,");
  await page.getByLabel("Inclure le bloc 2").uncheck();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: "Insérer les blocs sélectionnés" })
    .click();
  const result = JSON.parse(await page.getByRole("status").innerText());
  expect(result.positive).toBe(
    "existing,\n\n## Body\nblue_eyes, white_hair,\n##",
  );
  expect(result.negative).toBe("low_quality,");
});

test("future optimizer errors preserve the draft and closing cancels outstanding work", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Proposer des tags", exact: true })
    .click();
  await page.evaluate(() =>
    window.optimizerTest.reject?.(new Error("Test failure")),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Votre description est conservée",
  );
  await expect(page.getByLabel("Décrivez votre idée")).toHaveValue(
    "Une fille aux yeux bleus sur une plage",
  );
  await page
    .getByRole("button", { name: "Proposer des tags", exact: true })
    .click();
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  expect(await page.evaluate(() => window.optimizerTest.signal?.aborted)).toBe(
    true,
  );
  await expect(page.getByRole("status")).toHaveText(
    '{"positive":"existing,","negative":"low_quality,"}',
  );
});
