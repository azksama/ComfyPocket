import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
const adb = (...args) =>
  execFileSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
const pairing = await readFile(process.argv[2], "utf8");
const out = process.argv[3];
await mkdir(out, { recursive: true });
const socket = adb("shell", "cat", "/proc/net/unix")
  .split("\n")
  .find((l) => l.includes("webview_devtools_remote"))
  ?.trim()
  .split("@")[1];
if (!socket) throw Error("WebView debugging socket absent");
adb("forward", "tcp:9223", "localabstract:" + socket);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages()[0];
page.on("pageerror", (e) => console.log("Page error", e.message));
console.log("WebView title: " + (await page.title()));
await page.getByRole("button", { name: "Paramètres", exact: true }).click();
await page.getByRole("button", { name: "Ajouter une connexion" }).click();
await page.getByLabel("Nom de la connexion").fill("Test Android");
await page.getByText("Coller un fichier d’appairage", { exact: true }).click();
await page.getByLabel("Ou collez son contenu").fill(pairing);
await page.getByRole("button", { name: "Connecter mon PC" }).click();
await page
  .getByText("PC connecté", { exact: true })
  .waitFor({ timeout: 30000 });
for (const title of ["Votre création", "À votre mesure", "Aller plus loin"]) await page.getByRole("button", { name: new RegExp(title) }).click();
await page.locator(".model-select").click();
await page.getByLabel("Rechercher un modèle").fill("dreamshaper_8");
await page.locator(".model-choice").first().click();
await page.getByRole("button", { name: "Votre idée", exact: true }).click();
await page
  .getByLabel("Prompt positif", { exact: true })
  .fill(
    "A peaceful alpine lake and a wooden cabin, warm morning light, landscape photograph, no people",
  );
await page.getByRole("button", { name: "Terminé", exact: true }).click();
await page.getByLabel("Largeur").fill("512");
await page.getByLabel("Hauteur").fill("512");
await page
  .getByRole("button", { name: "Générer l’image", exact: true })
  .click();
await page
  .getByText("Génération terminée · 1 image", { exact: true })
  .waitFor({ timeout: 90000 });
await page.locator(".output-panel").scrollIntoViewIfNeeded();
await page.getByRole("button", { name: /Agrandir ComfyPocket/ }).click();
await page
  .getByRole("button", { name: "Enregistrer sur cet appareil" })
  .click();
await page
  .getByText("Image enregistrée dans Photos / ComfyPocket", { exact: true })
  .waitFor({ timeout: 30000 });
await page.screenshot({ path: out + "/android-saved.png" });
await page.getByRole("button", { name: "Fermer", exact: true }).click();
await page.getByRole("button", { name: "Galerie", exact: true }).click();
await page.getByLabel("Rechercher dans la galerie").fill("ComfyPocket");
await page
  .getByRole("button", { name: /Agrandir/ })
  .first()
  .waitFor();
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: out + "/android-gallery.png" });
const files = adb("shell", "ls", "/sdcard/Pictures/ComfyPocket");
if (!files.trim()) throw Error("No MediaStore image written");
await writeFile(
  out + "/android-check.json",
  JSON.stringify(
    {
      serial,
      platform: adb("shell", "getprop", "ro.build.version.release").trim(),
      nativeTLS: true,
      nativeGeneration: true,
      nativeImageDownload: true,
      mediaStoreFiles: files.trim().split("\n"),
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "Native Android TLS, GPU generation, gallery and MediaStore save passed.",
);
await browser.close();
