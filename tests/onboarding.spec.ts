import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
// Browser contract only. Biometric/device behaviour is validated separately on Android.
test.beforeEach(async ({ page }) => {
  await page.route("**/__native", (route) => {
    const command = route.request().postDataJSON().command;
    return route.fulfill({
      json: {
        value:
          command === "lock_status"
            ? {
                supported: false,
                available: false,
                enabled: false,
                unlocked: true,
              }
            : command === "profiles"
              ? []
              : null,
      },
    });
  });
});
test("setup resumes, persists preferences and completes accessibly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bienvenue chez Mochi" }),
  ).toBeVisible();
  for (let step = 0; step < 5; step++) {
    expect(
      (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
        .violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (step === 2) {
      await page.getByRole("switch", { name: "Mode gaucher" }).check();
    }
    if (step < 4)
      await page
        .getByRole("button", { name: "Continuer", exact: true })
        .click();
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Votre première création" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("left-handed")!)),
  ).toBe(true);
  await page.getByRole("button", { name: "Ouvrir mon atelier" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Votre première création" }),
  ).toHaveCount(0);
});
test("setup can be deferred without marking it complete", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Plus tard", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("onboarding-done")),
  ).toBe(null);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bienvenue chez Mochi" }),
  ).toBeVisible();
});
