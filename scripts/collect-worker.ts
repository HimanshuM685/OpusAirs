import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { bootstrap } from "../lib/bootstrap";
import { sql } from "../lib/db";
import { scheduleDiscovery, scheduleSnapshots } from "../lib/collect/scheduler";
import { runCollectJobs } from "../lib/collect/worker";
import { announceWorker } from "../lib/collect/worker-presence";
import { tinyfishReadiness } from "../lib/collect/budget";
import { readCollectionSettings } from "../lib/collect/control";
import { safeLogMessage } from "../lib/collect/reporter";

loadEnvConfig(process.cwd());
const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort()); process.once("SIGINT", () => shutdown.abort());
const args = process.argv.slice(2);
const value = (flag: string) => { const i = args.indexOf(flag); return i < 0 ? undefined : args[i + 1]; };
const id = randomUUID(), label = value("--name") || "Local contributor";
const json = args.includes("--json");
function log(message: string, fields: Record<string, unknown> = {}) {
  const time = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  if (json) console.log(JSON.stringify({ ts: new Date().toISOString(), worker_id: id, message, ...fields }));
  else console.log(`${time} IST  ${fields.job_id ? String(fields.job_id).slice(0, 8) + "  " : ""}${message}${fields.completed != null ? `  [${fields.completed}/${fields.total}]` : ""}`);
}
async function main() {
  const jobId = value("--job");
  if (args.includes("--job") && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId || "")) throw new Error("Use --job followed by a job UUID.");
  await bootstrap(); const q = sql();
  const settings = await readCollectionSettings(q); const ready = tinyfishReadiness();
  log(`Worker connected · ${label} · mode=${settings.transport_mode}`);
  log(`Tinyfish: ${ready.reason}`);
  log("Watching saved admin schedules and queued jobs. Ctrl+C saves progress and closes remote sessions.");
  try {
    do {
      await announceWorker(q, id, label);
      try {
        if (!jobId) { await scheduleSnapshots(q); await scheduleDiscovery(q); }
        await runCollectJobs(q, shutdown.signal, { id, label, jobId, log: (entry) => {
          log(entry.message, { job_id: entry.job_id, level: entry.level || "info", event: entry.event, ...entry.data });
          if ((args.includes("--once") || jobId) && entry.event === "job_error") process.exitCode = 1;
        } });
        if (jobId) {
          const job = (await q`SELECT status FROM pipeline_jobs WHERE id = ${jobId}`)[0];
          log(job ? `Selected job status: ${job.status}` : "Selected job was not found.");
          if (!job || ["queued", "error"].includes(String(job.status))) process.exitCode = 1;
        }
      } catch (err) { log(safeLogMessage(err), { level: "error" }); if (args.includes("--once") || jobId) process.exitCode = 1; }
      if (args.includes("--once") || jobId || shutdown.signal.aborted) break;
      await announceWorker(q, id, label);
      await new Promise<void>((resolve) => {
        const abort = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { shutdown.signal.removeEventListener("abort", abort); resolve(); }, 5000);
        shutdown.signal.addEventListener("abort", abort, { once: true });
        if (shutdown.signal.aborted) abort();
      });
    } while (!shutdown.signal.aborted);
  } finally { await announceWorker(q, id, label, "stopped"); log("Worker stopped."); }
}
void main().catch((err) => { log(safeLogMessage(err), { level: "error" }); process.exitCode = 1; });
