import { loadEnvConfig } from "@next/env";
import { bootstrap } from "../lib/bootstrap";
import { sql } from "../lib/db";
import { scheduleSnapshots } from "../lib/collect/scheduler";
import { runCollectJobs } from "../lib/collect/worker";

loadEnvConfig(process.cwd());
async function main() {
  await bootstrap();
  const q = sql();
  do {
    try {
      await scheduleSnapshots(q);
      const completed = await runCollectJobs(q);
      if (completed) console.log(JSON.stringify({ completed }));
    } catch (err) {
      console.error(err);
      if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, 30000));
  } while (true);
}
void main().catch((err) => { console.error(err); process.exitCode = 1; });
