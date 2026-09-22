import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
const q = (s) => `'${s.replaceAll("'", "''")}'`;
const run = (code) =>
  new Promise((resolve, reject) => {
    const c = spawn("powershell.exe", ["-NoProfile", "-Command", code], {
      windowsHide: true,
    });
    let out = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    c.on("error", reject);
    c.on("exit", (code) => resolve({ code, out }));
  });
test(
  "Studio identifies a Windows venv child without accepting foreign Python processes",
  { skip: process.platform !== "win32" },
  async () => {
    const r = await run(`. ${q(path.resolve("scripts/CompanionProcess.ps1"))}
 $parent=[pscustomobject]@{ProcessId=12;ExecutablePath='C:\\Comfy\\venv\\Scripts\\python.exe';CommandLine='"C:\\Comfy\\venv\\Scripts\\python.exe" main.py --port 8188'}
 $child=[pscustomobject]@{ParentProcessId=12;ExecutablePath='C:\\Python\\python.exe';CommandLine='"C:\\Python\\python.exe" main.py --port 8188'}
 if(-not(Test-ComfyEngineProcess $child $parent 'C:\\Comfy')){throw 'Venv child rejected'}
 $child.ParentProcessId=99
 if(Test-ComfyEngineProcess $child $parent 'C:\\Comfy'){throw 'Foreign parent accepted'}
 $child.ParentProcessId=12;$child.CommandLine='"C:\\Python\\python.exe" other.py --port 8188'
 if(Test-ComfyEngineProcess $child $parent 'C:\\Comfy'){throw 'Foreign script accepted'}
 `);
    assert.equal(r.code, 0, r.out);
  },
);
test(
  "Studio refuses to stop with queued images before touching any process",
  { skip: process.platform !== "win32" },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mochi-studio-test-"));
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ queue_running: [], queue_pending: [[1, "queued"]] }),
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      await writeFile(
        path.join(dir, "config.json"),
        JSON.stringify({
          comfyUrl: `http://127.0.0.1:${server.address().port}`,
          port: 59001,
        }),
      );
      await writeFile(
        path.join(dir, "studio.json"),
        JSON.stringify({ comfyDirectory: "C:\\fixture" }),
      );
      const r = await run(
        `& ${q(path.resolve("scripts/Studio-Control.ps1"))} -Action stop -SettingsFile ${q(path.join(dir, "studio.json"))} -ConfigDirectory ${q(dir)}`,
      );
      assert.notEqual(r.code, 0);
      assert.match(r.out, /Des images sont en cours ou en attente/);
    } finally {
      await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
