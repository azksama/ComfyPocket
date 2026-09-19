import { writeFile, mkdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { certificate } from "./certificate.mjs";
import { reissue } from "./reissue.mjs";
import {
  assertUninitialized,
  defaultConfigDirectory,
  loadIdentity,
} from "./identity.mjs";
import { createBridge } from "./server.mjs";

const args = process.argv.slice(2);
const arg = (key, fallback) => {
  const i = args.indexOf(key);
  return i < 0 ? fallback : args[i + 1];
};
const dir = path.resolve(arg("--config-dir", defaultConfigDirectory()));
await mkdir(dir, { recursive: true, mode: 0o700 });
if (args.includes("reissue")) {
  console.log(JSON.stringify(await reissue(dir, arg("--public-host"))));
} else if (args.includes("init")) {
  const cfgFile = path.join(dir, "config.json");
  await assertUninitialized(dir);
  const host = arg("--host", "127.0.0.1"),
    port = Number(arg("--port", "8189"));
  const addresses = [
    "127.0.0.1",
    ...Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && i.family === "IPv4")
      .map((i) => i.address),
  ];
  const hostname = arg("--hostname", "localhost");
  const cert = await certificate([hostname, host, arg("--public-host", host)]);
  const output = arg("--output");
  if (!output)
    throw new Error(
      "Précisez --output avec le dossier de générations ComfyUI.",
    );
  const roots = [{ name: "ComfyUI", path: path.resolve(output) }];
  const extra = arg("--extra-output");
  if (extra)
    roots.push({ name: "Stability Matrix", path: path.resolve(extra) });
  const config = {
    host,
    port,
    comfyUrl: arg("--comfy", "http://127.0.0.1:8188"),
    token: randomBytes(32).toString("hex"),
    roots,
    modelsRoot: arg("--models", path.resolve(output, "../../..", "Models")),
  };
  await writeFile(path.join(dir, "key.pem"), cert.private, {
    mode: 0o600,
    flag: "wx",
  });
  await writeFile(path.join(dir, "cert.pem"), cert.cert, { flag: "wx" });
  await writeFile(cfgFile, JSON.stringify(config, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  const publicHost = arg(
    "--public-host",
    host === "0.0.0.0"
      ? (addresses.find((a) => a !== "127.0.0.1") ?? "localhost")
      : host,
  );
  await writeFile(
    path.join(dir, "pairing.json"),
    JSON.stringify(
      {
        url: `https://${publicHost}:${port}`,
        token: config.token,
        certificate: cert.cert,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Configuration créée dans ${dir}. Transférez pairing.json au téléphone par un canal privé. Il contient la clé d’accès. Les clés ne sont pas affichées.`,
  );
} else {
  const { config, key, cert } = await loadIdentity(dir);
  const server = createBridge({
    ...config,
    stateDir: dir,
    modelsRoot: arg(
      "--models",
      config.modelsRoot ??
        path.resolve(config.roots[0].path, "../../..", "Models"),
    ),
    key,
    cert,
  });
  server.listen(config.port, config.host, () =>
    console.log(
      `Comfy Pocket : HTTPS sur ${config.host}:${config.port} ; ComfyUI local ${config.comfyUrl}`,
    ),
  );
  server.on("error", (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close(() => process.exit()));
}
