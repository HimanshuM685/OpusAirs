import { constructIndex } from "../apix";
import { bootstrap } from "../bootstrap";
import { cleanQuotes } from "../cleaning";
import { sql } from "../db";
import { upsertEvents, type CollectionEvent, type QuoteIn } from "../ingest";
import { enabledCollectors } from "./sources";
import {
  acquireLock,
  claimNext,
  countStatus,
  expandJobs,
  finishJob,
  blockPendingSource,
  jobSummary,
  reclaimStale,
  recordAttempt,
  releaseLock,
  rememberRoutes,
} from "./jobs";
import { degradedSources } from "./policy";
import type { CollectJob } from "./types";

export type PipelineOpts = {
  scrape?: boolean;
  routes?: { origin: string; destination: string }[];
  budget?: number;
  full?: boolean;
  force?: boolean;
};

function maxHours(): number {
  const n = Number(process.env.COLLECT_MAX_HOURS || 18);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

async function alert(text: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error("alert webhook failed", err);
  }
}

export async function runPipeline(opts?: PipelineOpts) {
  await bootstrap();
  const q = sql();
  if (opts?.scrape !== false && !opts?.force && process.env.SCRAPE_ENABLED !== "true") {
    return {
      collected: {},
      cleaned: 0,
      index_rows: 0,
      attempted: 0,
      pending_at_start: 0,
      skipped: true,
      coverage: null,
      reason: "SCRAPE_ENABLED is not true",
    };
  }
  if (opts?.scrape === false) {
    const cleaned = await cleanQuotes(q);
    const indexed = await constructIndex(q);
    return { collected: {}, cleaned, index_rows: indexed, attempted: 0, pending_at_start: 0, skipped: false, coverage: null };
  }

  const hours = maxHours();
  const lock = await acquireLock(q, hours);
  if (lock === "busy") {
    return { skipped: true, reason: "collect already running", attempted: 0, pending_at_start: 0, coverage: null };
  }

  const day = new Date().toISOString().slice(0, 10);
  const started = Date.now();
  let attempted = 0;
  let pendingAtStart = 0;
  const tally = new Map<string, { ok: number; missing: number; blocked: number; quotes: number; attempted: number }>();
  const bump = (source: string) => {
    const row = tally.get(source) ?? { ok: 0, missing: 0, blocked: 0, quotes: 0, attempted: 0 };
    tally.set(source, row);
    return row;
  };

  try {
    await reclaimStale(q);
    const sources = await enabledCollectors(q);
    await expandJobs(q, { collectedOn: day, sources: sources.map((s) => s.id), routes: opts?.routes });
    pendingAtStart = await countStatus(q, day, "pending");
    const byId = new Map(sources.map((s) => [s.id, s]));
    const closed = new Set<string>();
    const budget = opts?.full ? Number.POSITIVE_INFINITY : (opts?.budget ?? Number.POSITIVE_INFINITY);

    while (attempted < budget && Date.now() - started < hours * 3600 * 1000) {
      const job = await claimNext(q, day);
      if (!job) break;
      attempted += 1;
      const collector = byId.get(job.source);
      const row = bump(job.source);
      row.attempted += 1;
      if (closed.has(job.source)) {
        await finishJob(q, job.id, "blocked", "source closed");
        row.blocked += 1;
        continue;
      }
      if (!collector) {
        await finishJob(q, job.id, "failed", "unknown source");
        await recordAttempt(q, { jobId: job.id, source: job.source, host: "", status: "failed", http: null, quotes: 0, error: "unknown source" });
        continue;
      }
      try {
        const outcome = await collector.collect(job);
        await recordAttempt(q, {
          jobId: job.id,
          source: job.source,
          host: outcome.host,
          status: outcome.transient ? "retry" : outcome.status,
          http: outcome.http,
          quotes: outcome.quotes.length,
          error: outcome.reason,
        });
        if (outcome.transient) {
          const status = job.attempts >= 3 ? "failed" : "pending";
          await finishJob(q, job.id, status, outcome.reason);
          continue;
        }
        if (outcome.status === "ok") {
          const events = outcome.quotes.map((quote) => toEvent(job, quote));
          await upsertEvents(q, events, null);
          await rememberRoutes(q, events, day);
          row.ok += 1;
          row.quotes += events.length;
          await finishJob(q, job.id, "done", "");
        } else if (outcome.status === "missing") {
          row.missing += 1;
          await finishJob(q, job.id, "missing", outcome.reason);
        } else {
          row.blocked += 1;
          await finishJob(q, job.id, "blocked", outcome.reason);
          if (outcome.reason === "robots.txt" || outcome.reason === "challenge") {
            closed.add(job.source);
            row.blocked += await blockPendingSource(q, day, job.source, outcome.reason);
          }
        }
      } catch (err) {
        const message = String(err).slice(0, 200);
        const status = job.attempts >= 3 ? "failed" : "pending";
        await finishJob(q, job.id, status, message);
        await recordAttempt(q, { jobId: job.id, source: job.source, host: "", status: "retry", http: null, quotes: 0, error: message });
      }
    }

    const cleaned = await cleanQuotes(q);
    const indexed = await constructIndex(q);
    for (const [source, counts] of tally) {
      const note = `jobs ok=${counts.ok} missing=${counts.missing} blocked=${counts.blocked} quotes=${counts.quotes}`;
      await q`
        INSERT INTO collection_runs (
          started_at, finished_at, source, status, quotes_ok, quotes_missing, quotes_sold_out, quotes_blocked, notes
        ) VALUES (
          ${new Date(started).toISOString()}, ${new Date().toISOString()}, ${source}, 'ok',
          ${counts.quotes}, ${counts.missing}, 0, ${counts.blocked}, ${note.slice(0, 1000)}
        )
      `;
    }
    const jobs = await jobSummary(q, day);
    const degraded = degradedSources(
      [...tally.entries()].map(([source, c]) => ({ source, blocked: c.blocked, attempted: c.attempted })),
    );
    const coverage = { collected_on: day, attempted, pending_at_start: pendingAtStart, jobs, degraded };
    console.log(`collect coverage ${JSON.stringify(coverage)}`);
    if (degraded.length) await alert(`OpusAirs collect degraded: ${degraded.join(", ")} blocked > 50%`);
    return {
      skipped: false,
      attempted,
      pending_at_start: pendingAtStart,
      cleaned,
      index_rows: indexed,
      coverage,
      collected: Object.fromEntries([...tally.entries()].map(([k, v]) => [k, v.quotes])),
    };
  } finally {
    await releaseLock(q);
  }
}

function toEvent(job: CollectJob, quote: QuoteIn): CollectionEvent {
  return {
    source: job.source,
    origin: job.origin,
    destination: job.destination,
    carrier: quote.carrier,
    flight_no: quote.flight_no || "NA",
    dep_date: job.dep_date,
    return_date: job.return_date,
    trip_type: job.trip_type,
    fare_class: quote.fare_class || "ECONOMY",
    lead_time_days: quote.lead_time_days ?? 0,
    collected_on: job.collected_on,
    collected_at: new Date().toISOString(),
    status: "ok",
    base_fare: quote.base_fare,
    taxes: quote.taxes,
    udf: quote.udf,
    convenience: quote.convenience,
    total_fare: quote.total_fare,
  };
}
