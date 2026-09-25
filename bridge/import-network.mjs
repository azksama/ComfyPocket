import https from "node:https";
import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";

export const importError = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const privateNetworks = new BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
])
  privateNetworks.addSubnet(ip, bits, "ipv4");
for (const [ip, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
])
  privateNetworks.addSubnet(ip, bits, "ipv6");
export function publicAddress(ip) {
  const family = isIP(ip);
  return !!family && !privateNetworks.check(ip, family === 4 ? "ipv4" : "ipv6");
}
const suffix = (host, domain) => host === domain || host.endsWith("." + domain);
export function providerUrl(value, provider, download = false) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw importError("Lien invalide.");
  }
  const h = u.hostname;
  const allowed =
    provider === "civitai"
      ? ["civitai.com", "civitai.red"].includes(h) ||
        (download &&
          [
            "civitai.com",
            "civitai.red",
            "civitai.cloud",
            "civitai.net",
            "civitai.green",
            "r2.cloudflarestorage.com",
          ].some((d) => suffix(h, d)))
      : h === "huggingface.co" ||
        (download && ["huggingface.co", "hf.co"].some((d) => suffix(h, d)));
  if (
    !allowed ||
    u.protocol !== "https:" ||
    (u.port && u.port !== "443") ||
    u.username ||
    u.password ||
    u.hash
  )
    throw importError(
      "Utilisez un lien HTTPS Civitai (.com ou .red) ou Hugging Face.",
    );
  return u;
}
function safeLookup(host, options, cb) {
  lookup(host, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return cb(err);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      return cb(importError("Adresse réseau du fournisseur interdite."));
    if (options.all) cb(null, addresses);
    else cb(null, addresses[0].address, addresses[0].family);
  });
}
export async function remoteStream(
  value,
  { provider, token = "", signal, download = false } = {},
  redirects = 0,
) {
  const u = providerUrl(value, provider, download);
  const authenticated =
    provider === "civitai"
      ? ["civitai.com", "civitai.red"].includes(u.hostname)
      : u.hostname === "huggingface.co";
  const response = await new Promise((resolve, reject) => {
    const request = https.get(
      u,
      {
        lookup: safeLookup,
        signal,
        headers: {
          "User-Agent": "Mochi/0.12.0",
          "Accept-Encoding": "identity",
          ...(authenticated && token
            ? { Authorization: `Bearer ${token}` }
            : {}),
        },
      },
      resolve,
    );
    request.on("error", reject);
    request.setTimeout(60000, () =>
      request.destroy(
        importError("Le fournisseur ne répond plus. Réessayez.", 504),
      ),
    );
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
    response.destroy();
    if (redirects >= 6 || !response.headers.location)
      throw importError("Trop de redirections du fournisseur.");
    return remoteStream(
      new URL(response.headers.location, u).href,
      { provider, token, signal, download },
      redirects + 1,
    );
  }
  if (response.statusCode !== 200) {
    response.destroy();
    const code = response.statusCode;
    throw importError(
      [401, 403].includes(code)
        ? "Accès refusé : ajoutez une clé du fournisseur et acceptez les conditions du modèle sur son site."
        : code === 404
          ? "Fichier ou version introuvable chez le fournisseur."
          : code === 429
            ? "Limite du fournisseur atteinte. Réessayez plus tard."
            : `Le fournisseur a répondu HTTP ${code}.`,
      502,
    );
  }
  return response;
}
export async function remoteJson(url, options) {
  const stream = await remoteStream(url, {
    ...options,
    signal: AbortSignal.timeout(25000),
  });
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
      stream.destroy();
      throw importError(
        "Catalogue trop volumineux. Utilisez le lien d’un fichier.",
      );
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw importError("Réponse du fournisseur invalide.", 502);
  }
}
