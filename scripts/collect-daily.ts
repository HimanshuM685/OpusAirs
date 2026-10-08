import { loadEnvConfig } from "@next/env";
import { bootstrap } from "../lib/bootstrap";
import { sql } from "../lib/db";
import { scheduleDiscovery, scheduleSnapshots } from "../lib/collect/scheduler";

loadEnvConfig(process.cwd());
async function main() {
  await bootstrap();
  console.log(JSON.stringify({ job_ids: await scheduleSnapshots(sql()), discovery_job_id: await scheduleDiscovery(sql()) }));
}
void main().catch((err) => { console.error(err); process.exitCode = 1; });
