import { t as tr } from "./i18n";
import type { Pairing } from "./api";

/** Validate before a profile write; certificate trust is checked by the native client. */
export function parsePairing(text: string): Pairing {
  if (text.length > 100_000)
    throw new Error(tr("Fichier d’appairage trop volumineux."));
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(tr("Le fichier d’appairage doit contenir du JSON valide."));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Le fichier doit contenir url, token et certificate.");
  }
  const p = value as Record<string, unknown>;
  if (
    typeof p.url !== "string" ||
    typeof p.token !== "string" ||
    typeof p.certificate !== "string"
  ) {
    throw new Error(
      "Le fichier doit contenir url, token et certificate sous forme de texte.",
    );
  }
  let url: URL;
  try {
    url = new URL(p.url.trim());
  } catch {
    throw new Error(tr("L’adresse du PC est invalide."));
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      tr("Utilisez une adresse HTTPS sans chemin, identifiant ni paramètres."),
    );
  }
  const token = p.token.trim(),
    certificate = p.certificate.trim();
  if (
    token.length < 32 ||
    token.length > 256 ||
    !/^[\x21-\x7e]+$/.test(token)
  ) {
    throw new Error(
      tr("La clé d’accès doit contenir entre 32 et 256 caractères sans espace."),
    );
  }
  if (!certificate || certificate.length > 64 * 1024) {
    throw new Error("Le certificat du PC est manquant ou trop volumineux.");
  }
  return { url: url.origin, token, certificate };
}
