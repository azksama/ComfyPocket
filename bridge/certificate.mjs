import selfsigned from "selfsigned";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
export function checkedHost(host) {
  if (typeof host !== "string" || !host || host.length > 253 || !isIP(host) && !/^(?=.{1,253}$)[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(host)) throw Error("Hôte invalide : utilisez une IP ou un nom DNS, sans URL ni port.");
  return host;
}
export async function certificate(hosts = []) {
  const names = new Set(["localhost", "127.0.0.1", ...Object.values(networkInterfaces()).flat().filter(i => i?.family === "IPv4").map(i => i.address), ...hosts.map(checkedHost)]);
  names.delete("0.0.0.0"); names.delete("::");
  return selfsigned.generate([{ name: "commonName", value: "Comfy Pocket PC" }], {
    days: 3650, keySize: 2048, algorithm: "sha256", notBeforeDate: new Date(Date.now() - 60000),
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "extKeyUsage", serverAuth: true },
      { name: "subjectAltName", altNames: [...names].map(host => isIP(host) ? { type: 7, ip: host } : { type: 2, value: host }) },
    ],
  });
}
