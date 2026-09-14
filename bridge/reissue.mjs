import { readFile, writeFile, mkdir, copyFile, rename } from "node:fs/promises";
import path from "node:path";
import { X509Certificate } from "node:crypto";
import { certificate, checkedHost } from "./certificate.mjs";
// Explicit operation. The server token, listen address and ComfyUI configuration are preserved.
export async function reissue(dir, publicHost) {
  checkedHost(publicHost);
  const config = JSON.parse(await readFile(path.join(dir, "config.json"), "utf8"));
  const old = JSON.parse(await readFile(path.join(dir, "pairing.json"), "utf8"));
  const oldCertificate = new X509Certificate(await readFile(path.join(dir, "cert.pem")));
  const existingNames = oldCertificate.subjectAltName.split(", ").map(n => n.replace(/^(DNS:|IP Address:)/, "")).filter(n => !n.includes('"'));
  const cert = await certificate([config.host, new URL(old.url).hostname, publicHost, ...existingNames]);
  const local = { url: old.url, token: config.token, certificate: cert.cert };
  const remote = { ...local, url: `https://${publicHost.includes(":") ? "[" + publicHost + "]" : publicHost}:${config.port}` };
  const backup = path.join(dir, "backups", "certificate-" + new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(backup, { recursive: true, mode: 0o700 });
  for (const file of ["key.pem", "cert.pem", "pairing.json", "config.json"]) await copyFile(path.join(dir, file), path.join(backup, file));
  const files = { "key.pem": cert.private, "cert.pem": cert.cert, "pairing.json": JSON.stringify(local, null, 2), "pairing-public.json": JSON.stringify(remote, null, 2) };
  try {
    for (const [name, value] of Object.entries(files)) await writeFile(path.join(dir, name + ".next"), value, { mode: 0o600 });
    for (const name of Object.keys(files)) await rename(path.join(dir, name + ".next"), path.join(dir, name));
  } catch (error) {
    for (const name of ["key.pem", "cert.pem", "pairing.json"]) await copyFile(path.join(backup, name), path.join(dir, name));
    throw error;
  }
  return { backup, publicUrl: remote.url, localUrl: local.url, fingerprint: new X509Certificate(cert.cert).fingerprint256 };
}
