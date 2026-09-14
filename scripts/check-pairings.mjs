import https from "node:https";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const outputs = path.resolve(import.meta.dirname, "../..");
const proof = [];
for (const file of ["Appairage-PC-local-v0.3.json", "Appairage-PC-public.json"]) {
  const p = JSON.parse(await readFile(path.join(outputs, file), "utf8"));
  for (const endpoint of ["/bridge/info", "/api/system_stats", "/api/object_info/UpscaleModelLoader"]) {
    const result = await new Promise((resolve, reject) => {
      const req = https.get(new URL(endpoint, p.url), { ca: p.certificate, timeout: 12000, headers: { Authorization: "Bearer " + p.token } }, res => {
        const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => {
          if (res.statusCode !== 200) return reject(Error("HTTP " + res.statusCode));
          resolve(JSON.parse(Buffer.concat(chunks)));
        });
      });
      req.on("timeout", () => req.destroy(Error("Délai dépassé"))); req.on("error", reject);
    });
    proof.push({ file, url: p.url, endpoint, tlsVerified: true, result: endpoint.endsWith("info") ? { version: result.version } : endpoint.endsWith("system_stats") ? { devices: result.devices.map(d => d.name) } : result });
  }
}
await mkdir(path.join(outputs, "verification/v0.3"), { recursive: true });
await writeFile(path.join(outputs, "verification/v0.3/pairings.json"), JSON.stringify(proof, null, 2));
console.log("TLS local + public vérifié, authentification et GPU accessibles ; preuve sans secrets enregistrée.");
