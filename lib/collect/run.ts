import { constructIndex } from "../apix";
import { randomUUID } from "node:crypto";
import { bootstrap } from "../bootstrap";
import { cleanQuotes } from "../cleaning";
import { sql } from "../db";
import { toEvent, upsertEvents } from "../ingest";
import { clearIndexCache } from "../http-cache";
import { snapshotCoverage } from "../snapshot";
import { collectors, enabledCollectors } from "./sources";
import { acquireLock, claimNext, cellResultStatus, expandJobs, finishJob, jobSummary, needsRefresh, pendingJobs, reclaimStale, recordAttempt, releaseLock } from "./jobs";
import { degradedSources, istDate, leadDays } from "./policy";
import { resetRobotsCache } from "./robots";
import type { CollectCell, CollectJob, CollectResult, SourceAdapter } from "./types";
import { CollectBudget } from "./budget";
import { TinyfishApi } from "./tinyfish";
import { collectAirline } from "./airline";

export type PipelineOpts = {
  scrape?: boolean;
  routes?: { origin: string; destination: string }[];
  budget?: number;
  full?: boolean;
  slot?: string;
  snapshotAt?: string;
  day?: string;
  demo?: boolean;
  runId?: string;
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
  for (const [host, sources] of groups) {
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
  }
}

export async function runPipeline(opts: PipelineOpts = {}, database?: ReturnType<typeof sql>, shutdown?: AbortSignal) {
  await bootstrap(database);
  const q = database || sql();
  const snapshotAt = new Date(opts.snapshotAt || Date.now()).toISOString();
  const day = opts.day || istDate(new Date(snapshotAt));
  const slot = opts.slot || "adhoc";
  const hours = Math.max(0.01, Math.min(3, Number(process.env.COLLECT_MAX_HOURS) || 3));
  const owner = randomUUID();
  if (await acquireLock(q, 5 / 60, owner) === "busy") throw new Error("Collection lock busy; worker will retry queued job");
  const heartbeat = setInterval(() => {
    void q`UPDATE collect_lock SET started_at = NOW() WHERE id = 1 AND owner = ${owner}`.catch(console.error);
  }, 30000);
  heartbeat.unref();
  let cap: ReturnType<typeof setTimeout> | undefined;
  try {
    const budget = await new CollectBudget(q, opts.runId || randomUUID()).init();
    const elapsed = Date.now() - new Date(budget.state.started_at).getTime();
    const controller = new AbortController();
    cap = setTimeout(() => controller.abort(), Math.max(0, hours * 3600000 - elapsed));
    const signal = AbortSignal.any([controller.signal, ...(shutdown ? [shutdown] : [])]);
    if (elapsed >= hours * 3600000) controller.abort();
    await new TinyfishApi(budget).recover();
    resetRobotsCache();
    let adapters = await enabledCollectors(q, day, opts.demo === true);
    if (opts.scrape === false || day !== istDate()) adapters = adapters.filter((a) => a.kind !== "html" && a.kind !== "api");
    // Disabled adapters do not remove basket cells: snapshot completion still imputes every gap.
    const cells = await expandJobs(q, { collectedOn: day, snapshotAt, slot, sources: adapters.map((a) => a.id), routes: opts.routes,
      carriers: Object.fromEntries(adapters.filter((a) => a.carrier).map((a) => [a.id, a.carrier!])) });
    await reclaimStale(q, snapshotAt);
    const remaining = (await q`SELECT DISTINCT source FROM collect_jobs WHERE snapshot_at = ${snapshotAt} AND status = 'pending'`) as { source: string }[];
    const registry = collectors(q, day);
    for (const { source } of remaining) {
      if (adapters.some((a) => a.id === source)) continue;
      const rank = registry.find((a) => a.id === source)?.sourceRank ?? 90;
      // Resume never leaves a now-disabled source pending forever or refetches it.
      adapters.push({ id: source, sourceRank: rank, kind: "skip", enabled: () => false, allowedPath: async () => false,
        collect: async () => ({ source, sourceRank: rank, status: "blocked", quotes: [], notes: "adapter_disabled_for_slot" }) });
    }
    const pendingAtStart = (await jobSummary(q, day, snapshotAt)).pending || 0;
    const blocked = (await q`SELECT DISTINCT source FROM collect_jobs WHERE collected_on = ${day} AND status IN ('blocked', 'blocked_robots')
      AND (last_error LIKE '%robots%' OR last_error LIKE '%challenge%' OR last_error IN ('http_403', 'http_401', 'http_429'))`) as { source: string }[];
    const closed = new Set(blocked.map((r) => adapters.find((a) => a.id === r.source)?.host || r.source));
    let attempted = 0;
    const cellOf = (job: CollectJob): CollectCell => ({ origin: job.origin, destination: job.destination, depDate: job.dep_date,
      leadTimeDays: leadDays(day, job.dep_date), fareClass: "ECONOMY", tripType: "one_way" });
    const checkpoint = async (job: CollectJob, result: CollectResult, adapter: SourceAdapter) => {
      attempted++;
        for (const attempt of result.attempts || []) {
          await recordAttempt(q, { jobId: job.id, source: adapter.id, host: attempt.host,
            status: attempt.error || "http_ok", http: attempt.status || null, quotes: 0, error: attempt.error });
          await q`INSERT INTO collection_runs (started_at, finished_at, source, status, snapshot_at, notes)
            VALUES (${attempt.at}, ${attempt.at}, ${adapter.id}, 'http_attempt', ${snapshotAt}, ${`job=${job.id} host=${attempt.host} http=${attempt.status} ${attempt.error}`})`;
        }
        const quotes = result.status === "ok" || result.status === "sold_out" ? result.quotes : [];
        const rows = await q`
          INSERT INTO collection_runs (started_at, finished_at, source, status, snapshot_at,
            quotes_ok, quotes_missing, quotes_sold_out, quotes_blocked, quotes_blocked_robots, quotes_errors, notes)
          VALUES (NOW(), NOW(), ${adapter.id}, ${result.status}, ${snapshotAt},
            ${result.status === "ok" ? quotes.length : 0}, ${result.status === "missing" ? 1 : 0}, ${result.status === "sold_out" ? Math.max(1, quotes.length) : 0},
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
        if (result.source.startsWith("agent:")) await q`UPDATE pipeline_jobs SET vintage_note = 'agent_provisional' WHERE id = ${budget.runId}`;
        if (adapter.carrier && result.source === adapter.id && quotes.length) {
          await budget.airline(adapter.id, { path: "http", quotes_parsed: (budget.state.airlines[adapter.id]?.quotes_parsed || 0)
            + quotes.filter((r) => r.fare_class === 'ECONOMY' && (r.trip_type || 'one_way') === 'one_way').length });
        }
    };
    const offline = adapters.filter((a) => !a.carrier && !a.host);
    await drainAdapters<CollectJob>(offline, (a) => claimNext(q, snapshotAt, a.id), cellOf, checkpoint, closed);
    // v1: airlines strictly sequential; a session is released before the next airline begins.
    for (const adapter of adapters.filter((a) => !offline.includes(a))) {
      const jobs = await pendingJobs(q, snapshotAt, adapter.id);
      if (!jobs.length) continue;
      if (closed.has(adapter.host || adapter.id)) await budget.airline(adapter.id, { blocked_reason: "host_closed_today" });
      const observations = (await q`SELECT origin, destination, dep_date, collected_at FROM quotes_raw
        WHERE source IN (${adapter.id}, ${`tinyfish:${adapter.id}`}, ${`agent:${adapter.id}`}, 'manual', 'file_drop', 'csv') AND status = 'ok'
          AND carrier = ${adapter.carrier || 'NA'}
          AND parser_accepted = true AND UPPER(fare_class) = 'ECONOMY' AND trip_type = 'one_way'
          AND total_fare > 0 AND collected_at > NOW() - INTERVAL '36 hours'`) as { origin: string; destination: string; dep_date: string; collected_at: string }[];
      const refresh: CollectJob[] = [];
      for (const job of jobs) {
        if (needsRefresh(cellOf(job), observations)) refresh.push(job);
        else await finishJob(q, job.id, 'done', 'fresh_observation_under_36h');
      }
      const byCell = new Map(refresh.map((job) => [`${job.origin}|${job.destination}|${job.dep_date}`, job]));
      await q`UPDATE collect_jobs SET status = 'running', locked_at = NOW(), attempts = attempts + 1
        WHERE snapshot_at = ${snapshotAt} AND source = ${adapter.id} AND status = 'pending'`;
      const saved = new Set<number>();
      let checkpointFailure: unknown;
      const save = async (cell: CollectCell, result: CollectResult) => {
        const job = byCell.get(`${cell.origin}|${cell.destination}|${cell.depDate}`)!;
        try { await checkpoint(job, result, adapter); saved.add(job.id); }
        catch (err) { checkpointFailure = err; throw err; }
      };
      try {
        await collectAirline(adapter, refresh.map(cellOf), budget, save, signal, {
          browser: async (...args) => (await import("./sources/tinyfish-browser")).collectBrowser(...args),
          agent: async (...args) => (await import("./sources/tinyfish-agent")).collectAgent(...args),
        });
      } catch (err) {
        if (checkpointFailure) throw checkpointFailure;
        await budget.airline(adapter.id, { error: "airline_collection_failed" });
      }
      if (checkpointFailure) throw checkpointFailure;
      const reason = budget.state.airlines[adapter.id]?.blocked_reason;
      for (const job of refresh) {
        if (saved.has(job.id)) continue;
        await checkpoint(job, { source: adapter.id, sourceRank: adapter.sourceRank, status: reason?.includes('robots') ? 'blocked_robots' : reason ? 'blocked' : 'missing',
          quotes: [], notes: reason || (signal.aborted ? 'run_time_cap' : 'no_parseable_quote') }, adapter);
      }
    }
    const cleaned = await cleanQuotes(q);
    const indexRows = await constructIndex(q, { day, slot, snapshotAt, includeSynthetic: opts.demo === true });
    clearIndexCache();
    const coverage = await snapshotCoverage(q, snapshotAt);
    const jobs = await jobSummary(q, day, snapshotAt);
    const blockedSources = (await q`SELECT DISTINCT source FROM collect_jobs WHERE snapshot_at = ${snapshotAt}
      AND status IN ('blocked', 'blocked_robots')`) as { source: string }[];
    const rates = (await q`SELECT source, COUNT(*)::int AS attempted,
      COUNT(*) FILTER (WHERE status IN ('blocked', 'blocked_robots'))::int AS blocked
      FROM collect_jobs WHERE snapshot_at = ${snapshotAt} AND status <> 'pending' GROUP BY source`) as { source: string; attempted: number; blocked: number }[];
    const degraded = degradedSources(rates.map((r) => ({ source: r.source, attempted: Number(r.attempted), blocked: Number(r.blocked) })));
    if ((coverage.coverage < 0.8 || blockedSources.length) && process.env.ALERT_WEBHOOK && process.env.SCRAPE_ENABLED === "true") {
      try {
        await fetch(process.env.ALERT_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: `OpusAirs collection coverage=${coverage.coverage.toFixed(3)} blocked=${blockedSources.map((r) => r.source).join(", ")} degraded=${degraded.join(", ")}` }),
          signal: AbortSignal.timeout(10000) });
      } catch (err) { console.error("alert webhook failed", err); }
    }
    return { skipped: false, attempted, pending_at_start: pendingAtStart, cells, cleaned, index_rows: indexRows,
      snapshot_at: snapshotAt, snapshot_slot: slot, budget: budget.state, coverage: { ...coverage, jobs, blocked_sources: blockedSources.map((r) => r.source) } };
  } finally { clearTimeout(cap); clearInterval(heartbeat); await releaseLock(q, owner); }
}
