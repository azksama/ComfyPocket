// Run against an unlocked, paired DEBUG APK on a dedicated emulator:
// node tests/android-assistant.mjs emulator-5554
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const serial = process.argv[2];
assert.ok(
  serial?.startsWith("emulator-"),
  "Provide the dedicated emulator serial explicitly.",
);
const adb =
  process.env.ADB ||
  path.join(process.env.LOCALAPPDATA, "Android/Sdk/platform-tools/adb.exe");
const shell = (...args) =>
  execFileSync(adb, ["-s", serial, ...args], { encoding: "utf8" }).trim();
assert.equal(shell("shell", "getprop", "ro.kernel.qemu"), "1");
const pid = shell("shell", "pidof", "fr.azk.comfypocket");
assert.match(pid, /^\d+$/);
shell("forward", "tcp:9223", `localabstract:webview_devtools_remote_${pid}`);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223", {
  noDefaults: true,
});
const page = browser.contexts()[0].pages()[0];
const invoke = (command, args = {}) =>
  page.evaluate(
    ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
    { command, args },
  );
const output = "../verification/v0.14.0/android";
await mkdir(output, { recursive: true });
try {
  const pc = await invoke("api", { path: "/bridge/assistant", body: null });
  assert.equal(pc.ready, true, "Install Whisper on the paired QA PC first.");
  assert.equal(
    pc.taggerReady,
    true,
    "Install DanbotNL on the paired QA PC first.",
  );
  await page.getByRole("button", { name: "Atelier", exact: true }).click();
  await page.getByRole("button", { name: "Votre idée", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Écrire votre image",
    exact: true,
  });
  await editor
    .getByRole("button", { name: "Assistant vocal", exact: true })
    .click();
  const assistant = page.getByRole("dialog", {
    name: "Assistant vocal",
    exact: true,
  });
  const draft = assistant.getByLabel("Décrivez votre idée");
  const previous = await draft.inputValue();
  await draft.fill(
    "Une fille en robe rouge avec des yeux bleus et des cheveux blancs courts.",
  );
  await assistant
    .getByRole("button", { name: "Proposer des tags", exact: true })
    .click();
  await expect(
    assistant.getByText("Vérifier avant d’insérer", { exact: true }),
  ).toBeVisible({ timeout: 120000 });
  const tags = await assistant.getByLabel("Tags proposés").inputValue();
  assert.ok(
    tags.includes(", ") && !tags.includes("<"),
    "Return individual tags, without model markup.",
  );
  await page.screenshot({ path: `${output}/tags.png` });
  await assistant.getByRole("button", { name: "Dicter", exact: true }).click();
  // Permission UI was explored with ARTEMIS/ADB. Resolve the resource ID or
  // visible label before tapping its current bounds.
  if (
    !shell("shell", "dumpsys", "package", "fr.azk.comfypocket").includes(
      "android.permission.RECORD_AUDIO: granted=true",
    )
  ) {
    let bounds;
    for (let attempt = 0; attempt < 8 && !bounds; attempt++) {
      shell("shell", "uiautomator", "dump", "/sdcard/mochi-permission.xml");
      const xml = shell("shell", "cat", "/sdcard/mochi-permission.xml");
      const nodes = xml.match(/<node[^>]*>/g) || [];
      const node =
        nodes.find((n) =>
          n.includes(
            'resource-id="com.android.permissioncontroller:id/permission_allow_foreground_only_button"',
          ),
        ) || nodes.find((n) => n.includes('text="While using the app"'));
      bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
      if (!bounds) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(bounds, "Microphone permission dialog did not appear.");
    shell(
      "shell",
      "input",
      "tap",
      String(Math.round((+bounds[1] + +bounds[3]) / 2)),
      String(Math.round((+bounds[2] + +bounds[4]) / 2)),
    );
  }
  await expect(
    assistant.getByRole("button", { name: "Terminer la dictée", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  assert.equal(
    (await invoke("voice_action", { action: "status" })).phase,
    "recording",
  );
  await assistant.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect
    .poll(
      async () => (await invoke("voice_action", { action: "status" })).phase,
    )
    .toBe("idle");
  await draft.fill(previous);
  await assistant.getByRole("button", { name: "Fermer", exact: true }).click();
  await editor.getByRole("button", { name: "Terminé", exact: true }).click();
  console.log(
    "PASS: native PC tagging, review, microphone permission, recording and cancellation.",
  );
} finally {
  await invoke("voice_action", { action: "cancel" }).catch(() => {});
  await browser.close();
}
