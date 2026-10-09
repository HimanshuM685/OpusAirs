import type { sql as sqlFn } from "../db";
import { isoDateTime } from "../db";
import { snapshotCoverage } from "../snapshot";
import { budgetCap, tinyfishEnabled, type BudgetState } from "./budget";

export async function collectionHealth(q: ReturnType<typeof sqlFn>) {
  const snaps = (await q`SELECT snapshot_at, snapshot_slot FROM quote_snapshots ORDER BY snapshot_at DESC LIMIT 1`) as { snapshot_at: string; snapshot_slot: string }[];
  const at = snaps[0] ? new Date(snaps[0].snapshot_at).toISOString() : null;
  const latestJobs = (await q`SELECT id, status, stats, error, payload, vintage_note, created_at, started_at, heartbeat_at
    FROM pipeline_jobs WHERE type = 'collect' ORDER BY created_at DESC LIMIT 1`) as Record<string, unknown>[];
  const job = latestJobs[0] || null;
  const payload = job?.payload as { snapshotAt?: string } | undefined;
  const workAt = payload?.snapshotAt || at;
  const budgets = (await q`SELECT * FROM collect_budget WHERE run_id = ${job?.id ?? null}`) as BudgetState[];
  const budget = budgets[0];
  const blocked = (await q`SELECT DISTINCT source FROM collect_jobs WHERE snapshot_at = ${workAt} AND status IN ('blocked', 'blocked_robots')`) as { source: string }[];
  const progress = (await q`SELECT status, COUNT(*)::int AS n FROM collect_jobs WHERE snapshot_at = ${workAt} GROUP BY status`) as { status: string; n: number }[];
  const rows = (await q`
    SELECT source, MIN(started_at) AS started_at, MAX(finished_at) AS finished_at,
      SUM(quotes_ok)::int AS quotes_ok, SUM(quotes_missing)::int AS quotes_missing,
      SUM(quotes_sold_out)::int AS quotes_sold_out, SUM(quotes_blocked)::int AS quotes_blocked,
      SUM(quotes_blocked_robots)::int AS quotes_blocked_robots, SUM(quotes_errors)::int AS quotes_errors,
      STRING_AGG(DISTINCT NULLIF(notes, ''), '; ') AS notes
    FROM collection_runs WHERE snapshot_at = ${workAt} AND status <> 'http_attempt' GROUP BY source
  `) as Record<string, unknown>[];
  return {
    last_snapshot_at: at, snapshot_slot: snaps[0]?.snapshot_slot ?? null,
    ...(at ? await snapshotCoverage(q, at) : { coverage: 0, cell_coverage: 0, imputed_share: 1, vintage: "provisional", quality: "low", target_met: false, cells: 0, observed_cells: 0, unavailable_cells: 0 }),
    scrape_enabled: process.env.SCRAPE_ENABLED === "true", blocked_sources: blocked.map((r) => r.source),
    tinyfish_enabled: tinyfishEnabled(), sessions_opened: Number(budget?.sessions_opened || 0),
    sessions_deleted: Number(budget?.sessions_deleted || 0), agent_runs: Number(budget?.agent_runs || 0),
    session_attempts: Number(budget?.session_attempts || 0), max_sessions: budgetCap("TINYFISH_MAX_SESSIONS_PER_RUN"),
    max_agent_runs: budgetCap("TINYFISH_MAX_AGENT_RUNS_PER_RUN"), tinyfish_disabled: budget?.tinyfish_disabled || false,
    budget_notes: budget?.notes || null, airlines: budget?.airlines || {},
    job, progress: Object.fromEntries(progress.map((r) => [r.status, Number(r.n)])),
    sources: rows.map((r) => ({ source: r.source, last_started_at: isoDateTime(r.started_at), last_finished_at: isoDateTime(r.finished_at),
      status: Number(r.quotes_blocked) > 0 ? "blocked" : Number(r.quotes_errors) > 0 ? "error" : "ok",
      quotes_ok: Number(r.quotes_ok), quotes_missing: Number(r.quotes_missing), quotes_sold_out: Number(r.quotes_sold_out),
      quotes_blocked: Number(r.quotes_blocked), quotes_blocked_robots: Number(r.quotes_blocked_robots), quotes_errors: Number(r.quotes_errors), notes: r.notes || "" })),
  };
}
