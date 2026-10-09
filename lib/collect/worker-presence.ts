import type { sql as sqlFn } from "../db";
import { tinyfishReadiness } from "./budget";
type Q = ReturnType<typeof sqlFn>;

export async function announceWorker(q: Q, id: string, label: string, status = "idle", jobId: string | null = null) {
  const ready = tinyfishReadiness();
  await q`INSERT INTO collection_workers (id, label, status, current_job_id, tinyfish_ready, tinyfish_reason)
    VALUES (${id}, ${label.slice(0, 80)}, ${status}, ${jobId}, ${ready.ready}, ${ready.reason})
    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, status = EXCLUDED.status, current_job_id = EXCLUDED.current_job_id,
      heartbeat_at = NOW(), tinyfish_ready = EXCLUDED.tinyfish_ready, tinyfish_reason = EXCLUDED.tinyfish_reason`;
}
export async function acquireWorkerLease(q: Q, owner: string): Promise<boolean> {
  const rows = await q`UPDATE collection_worker_lease SET owner = ${owner}, heartbeat_at = NOW()
    WHERE id = 1 AND (owner IS NULL OR owner = ${owner} OR heartbeat_at < NOW() - INTERVAL '5 minutes') RETURNING id`;
  return Boolean(rows.length);
}
export async function renewWorkerLease(q: Q, owner: string): Promise<boolean> {
  return Boolean((await q`UPDATE collection_worker_lease SET heartbeat_at = NOW() WHERE id = 1 AND owner = ${owner} RETURNING id`).length);
}
export async function releaseWorkerLease(q: Q, owner: string) {
  await q`UPDATE collection_worker_lease SET owner = NULL WHERE id = 1 AND owner = ${owner}`;
}
