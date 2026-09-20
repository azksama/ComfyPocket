import { expect, test, type Page } from "@playwright/test";

type Profile = {
  id: string;
  name: string;
  pairing: { url: string; token: string; certificate: string };
};
const pairing = {
  url: "https://pc.example:8189",
  token: "x".repeat(64),
  certificate: "TEST CERTIFICATE",
};
const stats = {
  devices: [
    { name: "Test GPU", vram_free: 4 * 1024 ** 3, vram_total: 8 * 1024 ** 3 },
  ],
  system: { ram_free: 8 * 1024 ** 3, ram_total: 16 * 1024 ** 3 },
};

async function adapter(page: Page, items: Profile[] = [], lock = false) {
  const state = {
    items,
    active: "",
    saves: 0,
    failSave: false,
    unlocked: !lock,
    unlocks: 0,
    cancelUnlock: false,
    delayStatus: false,
    releaseStatus: () => {},
  };
  await page.addInitScript(() =>
    localStorage.setItem("biometric-auto-prompt", "false"),
  );
  await page.route("**/__native", async (route) => {
    const { command, args } = route.request().postDataJSON();
    let value: unknown = null;
    if (command === "lock_status") {
      value = {
        supported: lock,
        available: true,
        enabled: lock,
        unlocked: state.unlocked,
        delaySeconds: 30,
        hideRecents: true,
      };
      if (state.delayStatus) {
        state.delayStatus = false;
        await new Promise<void>((resolve) => {
          state.releaseStatus = resolve;
        });
      }
    }
    if (command === "unlock") {
      state.unlocks++;
      if (state.cancelUnlock) {
        await route.fulfill({ json: { error: "Authentification annulée" } });
        return;
      }
      state.unlocked = true;
      value = {
        supported: true,
        available: true,
        enabled: true,
        unlocked: true,
      };
    }
    if (command === "restore")
      value =
        state.items.find((p) => p.id === state.active)?.pairing.url ?? null;
    if (command === "list_profiles")
      value = state.items.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.pairing.url,
        active: p.id === state.active,
      }));
    if (command === "get_profile")
      value = state.items.find((p) => p.id === args.id);
    if (command === "save_profile") {
      state.saves++;
      if (state.failSave) {
        await route.fulfill({ json: { error: "Stockage indisponible" } });
        return;
      }
      const id = args.id ?? "new-" + state.saves;
      state.items = [
        ...state.items.filter((p) => p.id !== id),
        { id, name: args.name, pairing: args.pairing },
      ];
      if (state.active === id) state.active = "";
      value = id;
    }
    if (command === "activate_profile") {
      state.active = args.id;
      value = state.items.find((p) => p.id === state.active)?.pairing.url;
    }
    if (command === "disconnect") state.active = "";
    if (command === "api") {
      if (args.path === "/api/system_stats") value = stats;
      else if (args.path === "/api/object_info") value = {};
      else if (args.path === "/bridge/info") value = { version: 2, roots: [] };
      else if (args.path === "/api/queue")
        value = { queue_running: [], queue_pending: [] };
      else if (args.path.startsWith("/bridge/events"))
        value = { events: [], seq: 0, connected: true };
      else if (args.path.startsWith("/bridge/gallery"))
        value = { items: [], total: 0, warnings: [] };
      else if (args.path.startsWith("/bridge/trash")) value = { items: [] };
    }
    await route.fulfill({ json: { value } });
  });
  return state;
}

async function fillConnection(page: Page) {
  await page.getByLabel("Nom de la connexion", { exact: true }).fill("Maison");
  await page.getByLabel("Adresse du PC", { exact: true }).fill(pairing.url);
  await page.getByLabel("Clé d’accès", { exact: true }).fill(pairing.token);
  await page.getByText("Certificat du PC", { exact: true }).click();
  await page
    .getByLabel("Certificat PEM", { exact: true })
    .fill(pairing.certificate);
}

test("connection validation leaves the editable form intact and never sends invalid credentials", async ({
  page,
}) => {
  const state = await adapter(page);
  await page.goto("/");
  await fillConnection(page);
  await page.getByLabel("Clé d’accès", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".connection-form [role=alert]")).toContainText(
    "32 et 256",
  );
  expect(state.saves).toBe(0);
  await page.getByLabel("Clé d’accès", { exact: true }).fill(pairing.token);
  state.failSave = true;
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".connection-form [role=alert]")).toContainText(
    "Stockage indisponible",
  );
  await expect(
    page.getByLabel("Nom de la connexion", { exact: true }),
  ).toHaveValue("Maison");
  state.failSave = false;
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".profile-card")).toHaveCount(1);
  await expect(page.locator(".connection-form")).toHaveCount(0);
});

test("switching profiles at the same address refreshes the active badge", async ({
  page,
}) => {
  const state = await adapter(page, [
    { id: "first", name: "Premier", pairing },
    { id: "second", name: "Second", pairing },
  ]);
  await page.goto("/");
  await page
    .locator(".profile-card")
    .filter({ hasText: "Premier" })
    .getByRole("button", { name: "Connecter", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /PC connecté/ })).toBeVisible();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await page
    .locator(".profile-card")
    .filter({ hasText: "Second" })
    .getByRole("button", { name: "Connecter", exact: true })
    .click();
  await expect.poll(() => state.active).toBe("second");
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(page.locator(".profile-card.selected")).toContainText("Second");
  await expect(page.locator(".profile-card.selected")).toHaveCount(1);
  const first = await page.locator('.profile-card').first().boundingBox();
  const second = await page.locator('.profile-card').nth(1).boundingBox();
  expect(second!.y - first!.y - first!.height).toBeGreaterThanOrEqual(18);
});

test("an old locked status cannot relock the UI after authentication succeeds", async ({
  page,
}) => {
  const state = await adapter(page, [], true);
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Application verrouillée" }),
  ).toBeVisible();
  state.delayStatus = true;
  const pending = page.waitForRequest(
    (request) =>
      request.url().endsWith("/__native") &&
      request.postDataJSON().command === "lock_status",
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("pocket-lock-changed")),
  );
  await pending;
  await page
    .getByRole("button", { name: "Le libérer", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Application verrouillée" }),
  ).toHaveCount(0);
  state.releaseStatus();
  await expect(
    page.getByRole("heading", { name: "Mes ordinateurs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Application verrouillée" }),
  ).toHaveCount(0);
});


test("startup shields the app, then a canceled biometric prompt can be retried", async ({ page }) => {
  const state = await adapter(page, [], true);
  await page.addInitScript(() => localStorage.setItem("biometric-auto-prompt", "true"));
  state.cancelUnlock = true;
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Démarrage", exact: true })).toBeVisible();
  expect(state.unlocks).toBe(0);
  await expect(page.locator(".protected-app")).toHaveAttribute("inert", "");
  await expect(page.getByRole("heading", { name: "Mochi est enfermé" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("annulée");
  expect(state.unlocks).toBe(1);
  await page.screenshot({ path: "../verification/v0.10.0/lock-screen.png" });
  state.cancelUnlock = false;
  await page.getByRole("button", { name: "Le libérer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mes ordinateurs", exact: true })).toBeVisible();
  expect(state.unlocks).toBe(2);
  await expect(page.locator(".startup-splash")).toHaveCount(0);
});
