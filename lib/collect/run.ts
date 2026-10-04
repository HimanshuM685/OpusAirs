import { constructIndex } from "../apix";
import { randomUUID } from "node:crypto";
import { bootstrap } from "../bootstrap";
import { cleanQuotes } from "../cleaning";
import { sql } from "../db";
import { toEvent, upsertEvents } from "../ingest";
import { clearIndexCache } from "../http-cache";
import { snapshotCoverage } from "../snapshot";
import { enabledCollectors } from "./sources";
import { acquireLock, claimNext, cellResultStatus, expandJobs, finishJob, jobSummary, reclaimStale, recordAttempt, releaseLock } from "./jobs";
import { istDate, leadDays } from "./policy";
import { resetRobotsCache } from "./robots";
import type { CollectCell, CollectJob, CollectResult, SourceAdapter } from "./types";

export type PipelineOpts = {
  scrape?: boolean;
  routes?: { origin: string; destination: string }[];
  budget?: number;
  full?: boolean;
  slot?: string;
  snapshotAt?: string;
  day?: string;
  demo?: boolean;
};

// Each host has a single worker. A denial closes all adapters sharing that host for this slot.
export async function drainAdapters<T>(adapters: SourceAdapter[], next: (a: SourceAdapter) => Promise<T | null>,
  cell: (job: T) => CollectCell, save: (job: T, result: CollectResult, adapter: SourceAdapter) => Promise<void>,
  closed = new Set<string>()): Promise<void> {
  const groups = new Map<string, SourceAdapter[]>();
  for (const a of adapters) {
    const key = a.host || a.id;
    groups.set(key, [...(groups.get(key) || []), a]);
  }
  await Promise.all([...groups.entries()].map(async ([host, sources]) => {
    for (const adapter of sources) {
      let job: T | null;
      while ((job = await next(adapter)) != null) {
        let result: CollectResult;
        if (closed.has(host)) result = { source: adapter.id, sourceRank: adapter.sourceRank, status: "blocked", quotes: [], notes: "host_closed_this_slot" };
        else {
          try { result = await adapter.collect(cell(job)); }
          catch (err) { result = { source: adapter.id, sourceRank: adapter.sourceRank, status: "error", quotes: [], notes: String(err).slice(0, 500) }; }
          if (result.status === "blocked" || result.status === "blocked_robots") closed.add(host);
        }
        await save(job, result, adapter);
      }
    }
  }));
}

export async function runPipeline(opts: PipelineOpts = {}) {
  await bootstrap();
  const q = sql();
  const snapshotAt = opts.snapshotAt || new Date().toISOString();
  const day = opts.day || istDate(new Date(snapshotAt));
  const slot = opts.slot || "adhoc";
  const hours = Math.max(1, Number(process.env.COLLECT_MAX_HOURS) || 18);
  const owner = randomUUID();
  if (await acquireLock(q, 5 / 60, owner) === "busy") throw new Error("Collection lock busy; worker will retry queued job");
  const heartbeat = setInterval(() => {
    void q`UPDATE collect_lock SET started_at = NOW() WHERE id = 1 AND owner = ${owner}`.catch(console.error);
  }, 30000);
  heartbeat.unref();
  try {
    resetRobotsCache();
    let adapters = await enabledCollectors(q, day, opts.demo === true);
    if (opts.scrape === false || day !== istDate()) adapters = adapters.filter((a) => a.kind !== "html" && a.kind !== "api");
    // Disabled adapters do not remove basket cells: snapshot completion still imputes every gap.
    const cells = await expandJobs(q, { collectedOn: day, snapshotAt, slot, sources: adapters.map((a) => a.id), routes: opts.routes });
    await reclaimStale(q, snapshotAt);
    const pendingAtStart = (await jobSummary(q, day, snapshotAt)).pending || 0;
    const blocked = (await q`SELECT DISTINCT source FROM collect_jobs WHERE snapshot_at = ${snapshotAt} AND status IN ('blocked', 'blocked_robots')`) as { source: string }[];
    const closed = new Set(blocked.map((r) => adapters.find((a) => a.id === r.source)?.host || r.source));
    const started = Date.now();
    let attempted = 0;
    await drainAdapters<CollectJob>(adapters,
      async (adapter) => {
        if (attempted >= (opts.budget ?? Infinity) || Date.now() - started > hours * 3600000) return null;
        // Reserve budget before awaiting SQL so concurrent host workers cannot exceed the cap.
        attempted++;
        const job = await claimNext(q, snapshotAt, adapter.id);
        if (!job) attempted--;
        return job;
      },
      (job) => ({ origin: job.origin, destination: job.destination, depDate: job.dep_date,
        leadTimeDays: leadDays(day, job.dep_date), fareClass: "ECONOMY", tripType: "one_way" }),
      async (job, result, adapter) => {
        for (const attempt of result.attempts || []) {
          await recordAttempt(q, { jobId: job.id, source: adapter.id, host: attempt.host,
            status: attempt.error || "http_ok", http: attempt.status || null, quotes: 0, error: attempt.error });
          await q`INSERT INTO collection_runs (started_at, finished_at, source, status, snapshot_at, notes)
            VALUES (${attempt.at}, ${attempt.at}, ${adapter.id}, 'http_attempt', ${snapshotAt}, ${`job=${job.id} host=${attempt.host} http=${attempt.status} ${attempt.error}`})`;
        }
        const quotes = result.status === "ok" ? result.quotes : [];
        const rows = await q`
          INSERT INTO collection_runs (started_at, finished_at, source, status, snapshot_at,
            quotes_ok, quotes_missing, quotes_sold_out, quotes_blocked, quotes_blocked_robots, quotes_errors, notes)
          VALUES (NOW(), NOW(), ${adapter.id}, ${result.status}, ${snapshotAt},
            ${quotes.length}, ${result.status === "missing" ? 1 : 0}, ${result.status === "sold_out" ? 1 : 0},
            ${["blocked", "blocked_robots"].includes(result.status) ? 1 : 0}, ${result.status === "blocked_robots" ? 1 : 0},
            ${result.status === "error" ? 1 : 0}, ${(result.notes || "").slice(0, 1000)}) RETURNING id
        `;
        const input = quotes.length ? quotes : [{ source: result.source, origin: job.origin, destination: job.destination,
          carrier: "NA", flight_no: "NA", dep_date: job.dep_date, total_fare: null }];
        // Existing manual observations already carry their own audit provenance. Never rewrite them merely by reading.
        if (adapter.kind !== "manual" || !quotes.length) {
          await upsertEvents(q, input.map((quote) => toEvent({ ...quote, source: result.source,
            source_rank: result.sourceRank, collected_on: day, lead_time_days: leadDays(day, job.dep_date),
            snapshot_at: snapshotAt, fare_class: quote.fare_class || "ECONOMY", trip_type: "one_way",
            status: result.status, notes: result.notes })), Number(rows[0].id));
        }
        await recordAttempt(q, { jobId: job.id, source: adapter.id, host: adapter.host || "local",
          status: result.status, http: null, quotes: quotes.length, error: result.notes || "" });
        await finishJob(q, job.id, cellResultStatus(result.status), result.notes);
      }, closed);
    const cleaned = await cleanQuotes(q);
    const indexRows = await constructIndex(q, { day, slot, snapshotAt, includeSynthetic: opts.demo === true });
    clearIndexCache();
    const coverage = await snapshotCoverage(q, snapshotAt);
    const jobs = await jobSummary(q, day, snapshotAt);
    const blockedSources = (await q`SELECT DISTINCT source FROM collect_jobs WHERE snapshot_at = ${snapshotAt}
      AND status IN ('blocked', 'blocked_robots')`) as { source: string }[];
    return { skipped: false, attempted, pending_at_start: pendingAtStart, cells, cleaned, index_rows: indexRows,
      snapshot_at: snapshotAt, snapshot_slot: slot, coverage: { ...coverage, jobs, blocked_sources: blockedSources.map((r) => r.source) } };
  } finally { clearInterval(heartbeat); await releaseLock(q, owner); }
}
