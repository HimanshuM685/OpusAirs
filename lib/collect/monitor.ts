import type { sql as sqlFn } from "../db";
import { readCollectionSettings, listCollectionSchedules, readJobEvents } from "./control";
import { collectors } from "./sources";
import { istDate } from "./policy";
import type { CollectionJob } from "./contracts";

// Monitoring reads only the durable ledger. It never starts provider requests or
// rebuilds snapshots. Independent SQL reads run together to avoid RTT waterfalls.
export async function collectionMonitor(q: ReturnType<typeof sqlFn>, selectedId?: string) {
  const [settings, schedules, workers, recent, configured] = await Promise.all([
    readCollectionSettings(q), listCollectionSchedules(q),
    q`SELECT id, label, status, current_job_id, heartbeat_at, tinyfish_ready, tinyfish_reason,
        (status <> 'stopped' AND heartbeat_at > NOW() - INTERVAL '30 seconds') AS online
      FROM collection_workers ORDER BY heartbeat_at DESC LIMIT 8`,
    q`SELECT id, type, status, payload, progress, error, cancel_requested, created_at, started_at, heartbeat_at, finished_at
      FROM pipeline_jobs WHERE type = 'collect'
      ORDER BY CASE WHEN status = 'running' THEN 0 WHEN status = 'queued' THEN 1 ELSE 2 END, created_at DESC LIMIT 20`,
    q`SELECT id, enabled FROM scrape_sources`,
  ]);
  const jobs = recent as CollectionJob[];
  // A newly queued run must not hide the worker's active run.
  let job = selectedId ? jobs.find((item) => item.id === selectedId) : jobs.find((item) => item.status === "running")
    || [...jobs].reverse().find((item) => item.status === "queued") || jobs[0];
  if (selectedId && !job) job = (await q`SELECT id, type, status, payload, progress, error, cancel_requested, created_at, started_at, heartbeat_at, finished_at
    FROM pipeline_jobs WHERE id = ${selectedId} AND type = 'collect'`)[0] as CollectionJob | undefined;
  const at = job?.payload?.snapshotAt;
  const [events, budgetRows, groups, quoteRows] = job ? await Promise.all([
    readJobEvents(q, job.id),
    q`SELECT sessions_opened, sessions_deleted, session_attempts, agent_runs, tinyfish_disabled, notes, airlines FROM collect_budget WHERE run_id = ${job.id}`,
    q`SELECT source, status, COUNT(*)::int AS n FROM collect_jobs WHERE snapshot_at = ${at || null}::timestamptz GROUP BY source, status`,
    q`SELECT COUNT(*)::int AS n FROM quotes_raw WHERE snapshot_at = ${at || null}::timestamptz
      AND status = 'ok' AND total_fare > 0 AND source <> 'synthetic' AND parser_accepted = true`,
  ]) : [[], [], [], []];
  const counts: Record<string, number> = {};
  const sources = new Map<string, { source: string; total: number; completed: number; counts: Record<string, number> }>();
  for (const row of groups) {
    const n = Number(row.n); counts[row.status] = (counts[row.status] || 0) + n;
    const source = sources.get(row.source) || { source: row.source, total: 0, completed: 0, counts: {} as Record<string, number> };
    source.total += n; source.counts[row.status] = n;
    if (!["pending", "running"].includes(row.status)) source.completed += n;
    sources.set(row.source, source);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const byId = new Map(configured.map((row) => [row.id, row.enabled]));
  return { server_time: new Date().toISOString(), settings, schedules, workers, jobs, job: job || null, events,
    counts, total, completed: total - (counts.pending || 0) - (counts.running || 0), quotes: Number(quoteRows[0]?.n || 0),
    sources: [...sources.values()], budget: budgetRows[0] || null,
    adapters: collectors(q, istDate()).map((a) => ({ id: a.id, kind: a.kind, host: a.host || null, enabled: byId.get(a.id) === true, skipped_reason: a.skippedReason || null })),
  };
}
