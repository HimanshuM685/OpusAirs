import { loadEnvConfig } from "@next/env";
import { bootstrap } from "../lib/bootstrap";
import { sql } from "../lib/db";
import { scheduleDiscovery, scheduleSnapshots } from "../lib/collect/scheduler";
import { runCollectJobs } from "../lib/collect/worker";

loadEnvConfig(process.cwd());
const shutdown = new AbortController();
process.once("SIGTERM", () => shutdown.abort());
process.once("SIGINT", () => shutdown.abort());
async function main() {
  await bootstrap();
  const q = sql();
  do {
    try {
      await scheduleSnapshots(q);
      await scheduleDiscovery(q);
      const completed = await runCollectJobs(q, shutdown.signal);
      if (completed) console.log(JSON.stringify({ completed }));
    } catch (err) {
      console.error(err);
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once") || shutdown.signal.aborted) break;
    await new Promise<void>((r) => {
      const abort = () => { clearTimeout(t); r(); };
      const t = setTimeout(() => { shutdown.signal.removeEventListener("abort", abort); r(); }, 30000);
      shutdown.signal.addEventListener("abort", abort, { once: true });
    });
  } while (!shutdown.signal.aborted);
}
void main().catch((err) => { console.error(err); process.exitCode = 1; });
