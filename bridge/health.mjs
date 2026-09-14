import https from "node:https";
import { readFile } from "node:fs/promises";
import path from "node:path";
const dir = process.argv[2];
const config = JSON.parse(
  await readFile(path.join(dir, "config.json"), "utf8"),
);
const cert = await readFile(path.join(dir, "cert.pem"));
const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
await new Promise((resolve, reject) => {
  const req = https.get(
    `https://${host}:${config.port}/bridge/info`,
    {
      ca: cert,
      headers: { Authorization: `Bearer ${config.token}` },
      timeout: 5000,
    },
    (res) => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(Error("Le service ne reconnaît pas cet appairage."));
        try {
          if (JSON.parse(Buffer.concat(chunks)).version < 3) return reject(Error("Ancien compagnon actif : fermez sa console puis relancez Comfy Pocket."));
          console.log("Le compagnon HTTPS v3 est déjà actif."); resolve();
        } catch { reject(Error("Réponse du compagnon invalide.")); }
      });
    },
  );
  req.on("timeout", () => req.destroy(Error("Délai de connexion dépassé")));
  req.on("error", reject);
});
