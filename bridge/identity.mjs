import { readFile, access } from "node:fs/promises";
import { X509Certificate, createPrivateKey } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

export function defaultConfigDirectory(env = process.env) {
  return path.join(
    env.LOCALAPPDATA || env.XDG_CONFIG_HOME || path.join(homedir(), ".config"),
    "ComfyPocketPC",
  );
}

export async function assertUninitialized(dir) {
  for (const name of [
    "config.json",
    "key.pem",
    "cert.pem",
    "pairing.json",
    "pairing-public.json",
  ]) {
    try {
      await access(path.join(dir, name));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(
      "Identité ComfyPocket existante ou incomplète. Les clés sont conservées ; restaurez les fichiers manquants au lieu de réinitialiser l’appairage.",
    );
  }
}

/** Normal startup reads the durable identity; it never creates or rotates keys. */
export async function loadIdentity(dir) {
  const [raw, key, cert] = await Promise.all([
    readFile(path.join(dir, "config.json"), "utf8"),
    readFile(path.join(dir, "key.pem")),
    readFile(path.join(dir, "cert.pem")),
  ]);
  const config = JSON.parse(raw);
  const certificate = new X509Certificate(cert);
  if (!certificate.checkPrivateKey(createPrivateKey(key)))
    throw new Error(
      "La clé du compagnon ne correspond pas à son certificat. Les fichiers ont été conservés.",
    );
  if (Date.parse(certificate.validTo) <= Date.now())
    throw new Error(
      "Le certificat du compagnon a expiré. Un renouvellement explicite est nécessaire.",
    );
  for (const name of ["pairing.json", "pairing-public.json"]) {
    let pairing;
    try {
      pairing = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (
      pairing.token !== config.token ||
      new X509Certificate(pairing.certificate).fingerprint256 !==
        certificate.fingerprint256
    ) {
      throw new Error(
        `Appairage incohérent : ${name}. Les clés et fichiers existants ont été conservés.`,
      );
    }
  }
  return { config, key, cert };
}
