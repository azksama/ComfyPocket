import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { certificate } from "../bridge/certificate.mjs";
import { checkHealth } from "../bridge/health.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";
const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

test(
  "launcher only recognizes the exact Node CLI and configuration",
  { skip: !windows },
  async () => {
    const script = path.join(root, "bridge/cli.mjs"),
      config = "C:\\test config";
    const command = `"C:\\node\\node.exe" "${script}" --config-dir "${config}"`;
    const helper = path.join(root, "scripts/CompanionProcess.ps1");
    const result = await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      `
    . ${quote(helper)}
    $p=[pscustomobject]@{ExecutablePath='C:\\node\\node.exe';CommandLine=${quote(command)}}
    if(-not(Test-ComfyPocketProcess $p ${quote(script)} ${quote(config)})){throw 'Expected owned process'}
    if(Test-ComfyPocketProcess $p ${quote(script)} 'C:\\other'){throw 'Accepted foreign config'}
    if(Test-ComfyPocketProcess $p 'C:\\other\\cli.mjs' ${quote(config)}){throw 'Accepted foreign script'}
    $p.ExecutablePath='C:\\other.exe'
    if(Test-ComfyPocketProcess $p ${quote(script)} ${quote(config)}){throw 'Accepted foreign executable'}
  `,
    ]);
    assert.equal(result.code, 0, result.output);
  },
);

test(
  "launcher replaces stale TLS instance without changing credentials, then reuses healthy process",
  { skip: !windows, timeout: 90000 },
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "pocket-launcher-"));
    const configDir = path.join(dir, "config"),
      stability = path.join(dir, "stability");
    const packageDir = path.join(stability, "Data/Packages/ComfyUI");
    await mkdir(configDir, { recursive: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      path.join(packageDir, "main.py"),
      "# fixture, never executed",
    );
    const upstream = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ system: { fixture: true }, devices: [] }));
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const reservation = net.createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const cert = await certificate(["127.0.0.1"]),
      replacement = await certificate(["127.0.0.1"]);
    const config = {
      host: "127.0.0.1",
      port,
      token: "test-only-launcher".repeat(4),
      comfyUrl: `http://127.0.0.1:${upstream.address().port}`,
      roots: [{ name: "fixture", path: dir }],
    };
    const pairing = (cert) =>
      JSON.stringify({
        url: `https://127.0.0.1:${port}`,
        token: config.token,
        certificate: cert.cert,
      });
    const files = {
      "config.json": JSON.stringify(config),
      "key.pem": cert.private,
      "cert.pem": cert.cert,
      "pairing.json": pairing(cert),
    };
    for (const [name, value] of Object.entries(files))
      await writeFile(path.join(configDir, name), value);
    const cli = path.join(root, "bridge/cli.mjs");
    const old = spawn(process.execPath, [cli, "--config-dir", configDir], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(async () => {
      old.kill();
      const stop = `. ${quote(path.join(root, "scripts/CompanionProcess.ps1"))}; if(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue){Restart-StaleComfyPocket -ScriptPath ${quote(cli)} -ConfigDirectory ${quote(configDir)} -Port ${port}}`;
      await run("powershell.exe", ["-NoProfile", "-Command", stop]);
      await new Promise((resolve) => upstream.close(resolve));
      await rm(dir, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Fixture failed to start")),
        10000,
      );
      old.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
      old.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Fixture exited"));
      });
    });
    await checkHealth(configDir, { upstream: true });
    // Simulate a server still holding another identity in memory, as in the reported incident.
    files["key.pem"] = replacement.private;
    files["cert.pem"] = replacement.cert;
    files["pairing.json"] = pairing(replacement);
    for (const [name, value] of Object.entries(files))
      await writeFile(path.join(configDir, name), value);
    await assert.rejects(checkHealth(configDir));
    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(root, "scripts/Start-ComfyPocket.ps1"),
      "-ConfigDirectory",
      configDir,
      "-StabilityRoot",
      stability,
      "-Port",
      String(port),
    ];
    const first = await run("powershell.exe", args);
    assert.equal(first.code, 0, first.output);
    assert.match(first.output, /Ancienne instance/);
    await checkHealth(configDir, { upstream: true });
    const second = await run("powershell.exe", args);
    assert.equal(second.code, 0, second.output);
    assert.doesNotMatch(second.output, /Ancienne instance/);
    for (const [name, value] of Object.entries(files))
      assert.equal(await readFile(path.join(configDir, name), "utf8"), value);
  },
);
