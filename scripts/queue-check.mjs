import https from "node:https";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const pairing = JSON.parse(await readFile(process.argv[2], "utf8"));
const call = (route, body) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      new URL(route, pairing.url),
      {
        ca: pairing.certificate,
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${pairing.token}`,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          if (res.statusCode >= 400)
            return reject(Error(String(res.statusCode)));
          resolve(JSON.parse(text || "{}"));
        });
      },
    );
    req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
const initial = await call("/api/queue");
if (initial.queue_running.length || initial.queue_pending.length)
  throw Error("Queue not empty; refusing to interfere with another job.");
const history = await call("/api/history?max_items=30");
const graph = Object.values(history)
  .map((h) => h.prompt?.[2])
  .find(
    (g) => g?.["7"]?.inputs?.filename_prefix === "ComfyPocket/Test_connection",
  );
if (!graph) throw Error("Run live-check first.");
graph["5"].inputs.steps = 150;
graph["5"].inputs.seed = crypto.getRandomValues(new Uint32Array(1))[0];
const a = await call("/api/prompt", {
  prompt: graph,
  client_id: "queue-verification",
});
graph["5"].inputs.seed++;
const b = await call("/api/prompt", {
  prompt: graph,
  client_id: "queue-verification",
});
let pendingDeleted = false,
  runningInterrupted = false;
try {
  for (let i = 0; i < 80; i++) {
    const q = await call("/api/queue");
    if (q.queue_running.some((j) => j[1] === a.prompt_id)) {
      await call("/api/queue", { delete: [b.prompt_id] });
      pendingDeleted = !(await call("/api/queue")).queue_pending.some(
        (j) => j[1] === b.prompt_id,
      );
      await call("/api/interrupt", { prompt_id: a.prompt_id });
      runningInterrupted = true;
      break;
    }
    await setTimeout(250);
  }
  if (!runningInterrupted) throw Error("Test task did not start");
  for (let i = 0; i < 80; i++) {
    const q = await call("/api/queue");
    if (
      !q.queue_running.some((j) => j[1] === a.prompt_id) &&
      !q.queue_pending.some((j) => j[1] === a.prompt_id)
    ) {
      const h = await call("/api/history/" + a.prompt_id);
      const proof = {
        pendingDeleted,
        runningInterrupted,
        status: h[a.prompt_id]?.status?.status_str,
        ids: [a.prompt_id, b.prompt_id],
        timestamp: new Date().toISOString(),
      };
      if (!pendingDeleted || proof.status !== "error")
        throw Error("Cancellation not verified");
      await writeFile(process.argv[3], JSON.stringify(proof, null, 2));
      console.log(JSON.stringify(proof));
      process.exit(0);
    }
    await setTimeout(500);
  }
  throw Error("Cancellation timeout");
} finally {
  await call("/api/queue", { delete: [a.prompt_id, b.prompt_id] });
  await call("/api/interrupt", { prompt_id: a.prompt_id });
}
