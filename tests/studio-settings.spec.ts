import { test, expect } from "@playwright/test";
test("Studio keeps onboarding dismissed and public sharing editable after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1120, height: 820 });
  await page.addInitScript(() => {
    const initial = {
      comfyDirectory: "C:/Comfy",
      modelsDirectory: "C:/Models",
      reserveVram: 0.9,
      preview: "auto",
      attention: "pytorch",
      disableDynamicVram: true,
      listenLan: true,
      port: 8189,
      sharePublic: false,
      publicHost: "",
      autoStart: false,
      startWithWindows: false,
      closeToTray: true,
      reducedMotion: false,
      checkUpdates: false,
      onboardingDone: false,
      onboardingSeen: false,
      onboardingStep: 0,
      modelPaths: {},
    };
    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: () => 1,
      invoke: async (cmd: string, args: any) => {
        const s =
          JSON.parse(localStorage.getItem("studio-test") || "null") || initial;
        if (cmd === "get_settings") return s;
        if (cmd === "get_status")
          return {
            engine: true,
            bridge: true,
            ready: true,
            busy: false,
            phase: "",
            message: "",
            paired: true,
            urls: [],
            queue: 0,
          };
        if (cmd === "onboarding_progress") {
          s.onboardingStep = args.step;
          s.onboardingSeen = true;
          s.onboardingDone ||= args.done;
          localStorage.setItem("studio-test", JSON.stringify(s));
          return s;
        }
        if (cmd === "save_settings") {
          const next = {
            ...args.settings,
            onboardingDone: s.onboardingDone,
            onboardingSeen: s.onboardingSeen,
          };
          localStorage.setItem("studio-test", JSON.stringify(next));
          return next;
        }
        return null;
      },
    };
  });
  await page.goto(`http://127.0.0.1:${process.env.MOCHI_STUDIO_TEST_PORT || 14430}`);
  await expect(
    page.getByRole("heading", { name: "Bienvenue chez Mochi" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bienvenue chez Mochi" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reprendre la configuration" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  const toggle = page.getByRole("checkbox", {
    name: /Partager sur IP publique/,
  });
  await expect(toggle).toBeEnabled();
  await toggle.check();
  await page.getByLabel(/Adresse IP publique ou domaine/).fill("example.org");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel(/Adresse IP publique ou domaine/)).toHaveValue(
    "example.org",
  );
  await page.screenshot({
    path: "../verification/v0.15.0/studio-settings.png",
  });
});
