import { randomUUID } from "node:crypto";
import type { sql as sqlFn } from "../db";
import { runPipeline, type PipelineOpts } from "./run";
import { discoverRoutes } from "./discover";
import { recoverOrphanedBudgets } from "./tinyfish";
import { constructIndex } from "../apix";
import { ingestQuotes, parseCsvQuotes, type QuoteIn } from "../ingest";
import { parseDump } from "../parse-dump";
import { clearIndexCache } from "../http-cache";
import { recordJobEvent, updateJobProgress, type CollectionEvent } from "./control";
import { safeLogMessage } from "./reporter";
import { acquireWorkerLease, announceWorker, releaseWorkerLease, renewWorkerLease } from "./worker-presence";

type Q = ReturnType<typeof sqlFn>;
export type WorkerOptions = { id?: string; label?: string; jobId?: string; log?: (event: CollectionEvent & { job_id: string }) => void; onLeaseBusy?: () => void };
// A job that crashes or stalls this many times is failed instead of requeued forever.
export const MAX_JOB_ATTEMPTS = 3;

export async function runCollectJobs(q: Q, shutdown?: AbortSignal, options: WorkerOptions = {}): Promise<number> {
  const owner = options.id || randomUUID();
  if (!await acquireWorkerLease(q, owner)) { options.onLeaseBusy?.(); return 0; }
  let completed = 0;
  try {
    // Only the lease owner recovers remote resources; another contributor cannot
    // cancel sessions of a healthy worker while competing for jobs.
    let recoveryLeaseLost = false;
    const recoveryBeat = setInterval(() => {
      void renewWorkerLease(q, owner).then((ok) => { if (!ok) recoveryLeaseLost = true; }).catch(() => { recoveryLeaseLost = true; });
    }, 5000);
    try { await recoverOrphanedBudgets(q); } finally { clearInterval(recoveryBeat); }
    if (recoveryLeaseLost || !await renewWorkerLease(q, owner)) return 0;
    await q`UPDATE pipeline_jobs SET worker_id = NULL,
        status = CASE WHEN attempts >= ${MAX_JOB_ATTEMPTS} THEN 'error' ELSE 'queued' END,
        error = CASE WHEN attempts >= ${MAX_JOB_ATTEMPTS} THEN ${`Worker stalled ${MAX_JOB_ATTEMPTS} times; start a new run`} ELSE error END,
        finished_at = CASE WHEN attempts >= ${MAX_JOB_ATTEMPTS} THEN NOW() ELSE finished_at END
      WHERE type IN ('collect', 'discover', 'ingest', 'rebuild') AND status = 'running'
        AND COALESCE(heartbeat_at, started_at, created_at) < NOW() - INTERVAL '5 minutes'`;
    await q`UPDATE pipeline_jobs SET status = 'cancelled', finished_at = NOW() WHERE status = 'queued' AND cancel_requested = true`;
    await q`UPDATE collection_schedules s SET status = j.status, updated_at = NOW() FROM pipeline_jobs j
      WHERE s.pipeline_job_id = j.id AND s.recurrence = 'once' AND s.status = 'queued' AND j.status IN ('ok', 'error', 'cancelled')`;
    while (!shutdown?.aborted) {
      const rows = (await q`UPDATE pipeline_jobs SET status = 'running', worker_id = ${owner}, attempts = attempts + 1, started_at = COALESCE(started_at, NOW()), heartbeat_at = NOW(), error = NULL
        WHERE id = (SELECT id FROM pipeline_jobs WHERE type IN ('collect', 'discover', 'ingest', 'rebuild')
          AND status = 'queued' AND cancel_requested = false AND (${options.jobId || null}::uuid IS NULL OR id = ${options.jobId || null}::uuid)
          AND NOT EXISTS (SELECT 1 FROM pipeline_jobs WHERE status = 'running' AND heartbeat_at >= NOW() - INTERVAL '5 minutes')
          ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, type, payload, attempts`) as { id: string; type: string; payload: PipelineOpts; attempts: number }[];
      const job = rows[0];
      if (!job) break;
      const controller = new AbortController();
      const signal = shutdown ? AbortSignal.any([shutdown, controller.signal]) : controller.signal;
      let cancelled = false; let lostLease = false; let ticking: Promise<void> | undefined;
      const emit = async (entry: CollectionEvent) => {
        const safe = { ...entry, message: safeLogMessage(entry.message) };
        await recordJobEvent(q, job.id, safe); options.log?.({ ...safe, job_id: job.id });
      };
      const beat = (): Promise<void> => {
        if (ticking) return ticking;
        ticking = (async () => {
        try {
          if (!await renewWorkerLease(q, owner)) { lostLease = true; controller.abort(); return; }
          const current = await q`UPDATE pipeline_jobs SET heartbeat_at = NOW()
            WHERE id = ${job.id} AND status = 'running' AND worker_id = ${owner} RETURNING cancel_requested`;
          if (!current.length) { lostLease = true; controller.abort(); return; }
          cancelled = current[0].cancel_requested === true;
          if (cancelled) controller.abort();
          if (options.id) await announceWorker(q, owner, options.label || "Contributor", cancelled ? "stopping" : "working", job.id);
        } catch { lostLease = true; controller.abort(); }
        })().finally(() => { ticking = undefined; });
        return ticking;
      };
      const heartbeat = setInterval(() => void beat(), 5000); heartbeat.unref();
      try {
        await beat();
        if (signal.aborted) throw new Error("Collection interrupted before execution");
        await emit({ event: "job_claimed", message: `Worker claimed ${job.type} job` });
        let stats: unknown;
        if (job.type === "collect") {
          // A crashed attempt's reservations would block Tinyfish on the retry. Reset them
          // only once its remote sessions/agents are closed (recoverOrphanedBudgets ran above).
          if (job.attempts > 1) await q`UPDATE collect_budget SET airlines = '{}'::jsonb, session_attempts = 0, agent_runs = 0, started_at = NOW()
            WHERE run_id = ${job.id} AND sessions_opened <= sessions_deleted AND NOT EXISTS (
              SELECT 1 FROM jsonb_each(airlines) a WHERE a.value->>'agent_id' IS NOT NULL
                AND NOT COALESCE((a.value->>'agent_terminal')::boolean, false))`;
          stats = await runPipeline({ ...job.payload, runId: job.id }, q, signal, (entry) => options.log?.({ ...entry, job_id: job.id }));
        } else if (job.type === "discover") {
          stats = await discoverRoutes(q, job.id, job.payload.day, signal);
        } else if (job.type === "ingest") {
          await updateJobProgress(q, job.id, { stage: "ingesting" });
          const payload = job.payload as { mode?: string; text?: string; quotes?: QuoteIn[]; rebuild_index?: boolean };
          const quotes = payload.mode === "csv" ? parseCsvQuotes(payload.text || "") : payload.quotes?.length ? payload.quotes : await parseDump(payload.text || "");
          if (!quotes.length) throw new Error("No quotes parsed");
          stats = await ingestQuotes(q, quotes, payload.rebuild_index !== false);
        } else {
          await updateJobProgress(q, job.id, { stage: "rebuilding" });
          stats = { index_rows: await constructIndex(q), vintage: (job.payload as { vintage?: string }).vintage || "provisional" };
        }
        await beat();
        if (lostLease) throw new Error("Worker lease lost; stored progress is available for recovery");
        if (cancelled) throw new Error("Cancellation requested by operator");
        clearIndexCache();
        const finished = await q`UPDATE pipeline_jobs SET status = 'ok', finished_at = NOW(), stats = ${JSON.stringify(stats)}::jsonb,
          progress = progress || '{"stage":"complete"}'::jsonb WHERE id = ${job.id} AND worker_id = ${owner} AND cancel_requested = false RETURNING id`;
        if (!finished.length) {
          await beat();
          throw new Error(cancelled ? "Cancellation requested by operator" : "Job ownership changed before completion");
        }
        await emit({ event: "job_completed", message: "Job completed; inspect observed quotes and gaps separately." });
        completed++;
      } catch (err) {
        const message = safeLogMessage(err);
        const retry = !cancelled && !lostLease && (shutdown?.aborted || message.includes("Collection lock busy"));
        const status = cancelled ? "cancelled" : retry ? "queued" : "error";
        if (!lostLease) {
          // Shutdown and lock contention are not the job's fault: give the attempt back.
          await q`UPDATE pipeline_jobs SET status = ${status}, attempts = attempts - ${retry ? 1 : 0}, finished_at = ${retry ? null : new Date().toISOString()}, error = ${message},
            progress = progress || ${JSON.stringify({ stage: cancelled ? "cancelled" : retry ? "paused" : "failed" })}::jsonb
            WHERE id = ${job.id} AND worker_id = ${owner}`;
          await emit({ level: cancelled || retry ? "warn" : "error", event: `job_${status}`, message });
        }
        if (retry || lostLease) break;
      } finally { clearInterval(heartbeat); await ticking; }
      await q`UPDATE collection_schedules SET status = (SELECT status FROM pipeline_jobs WHERE id = ${job.id}), updated_at = NOW()
        WHERE pipeline_job_id = ${job.id} AND recurrence = 'once'`;
      if (options.jobId) break;
    }
  } finally { await releaseWorkerLease(q, owner); }
  return completed;
}
