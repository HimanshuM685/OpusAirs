import type { sql as sqlFn } from "../db";
import { runPipeline, type PipelineOpts } from "./run";
import { discoverRoutes } from "./discover";
import { recoverOrphanedBudgets } from "./tinyfish";
import { constructIndex } from "../apix";
import { ingestQuotes, parseCsvQuotes, type QuoteIn } from "../ingest";
import { parseDump } from "../parse-dump";
import { clearIndexCache } from "../http-cache";

export async function runCollectJobs(q: ReturnType<typeof sqlFn>, shutdown?: AbortSignal): Promise<number> {
  await recoverOrphanedBudgets(q);
  await q`UPDATE pipeline_jobs SET status = 'queued', started_at = NULL
      WHERE type IN ('collect', 'discover', 'ingest', 'rebuild') AND status = 'running' AND COALESCE(heartbeat_at, started_at) < NOW() - INTERVAL '5 minutes'`;
  let done = 0;
  for (;;) {
    if (shutdown?.aborted) return done;
    const rows = (await q`
      UPDATE pipeline_jobs SET status = 'running', started_at = NOW(), heartbeat_at = NOW(), error = NULL
       WHERE id = (SELECT id FROM pipeline_jobs WHERE type IN ('collect', 'discover', 'ingest', 'rebuild') AND status = 'queued'
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, type, payload
    `) as { id: string; type: string; payload: PipelineOpts }[];
    const job = rows[0];
    if (!job) return done;
    const heartbeat = setInterval(() => {
      void q`UPDATE pipeline_jobs SET heartbeat_at = NOW() WHERE id = ${job.id} AND status = 'running'`.catch(console.error);
    }, 30000);
    heartbeat.unref();
    try {
      if (job.type === "discover") {
        const stats = await discoverRoutes(q, job.id, job.payload.day, shutdown);
        await q`UPDATE pipeline_jobs SET status = 'ok', finished_at = NOW(), stats = ${JSON.stringify(stats)}::jsonb WHERE id = ${job.id}`;
        done++;
        continue;
      }
      if (job.type === "ingest") {
        const payload = job.payload as { mode?: string; text?: string | null; quotes?: QuoteIn[] | null; rebuild_index?: boolean };
        const quotes = payload.mode === "csv"
          ? parseCsvQuotes(payload.text || "")
          : payload.quotes?.length ? payload.quotes : await parseDump(payload.text || "");
        if (!quotes.length) throw new Error("No quotes parsed");
        const stats = await ingestQuotes(q, quotes, payload.rebuild_index !== false);
        clearIndexCache();
        await q`UPDATE pipeline_jobs SET status = 'ok', finished_at = NOW(), stats = ${JSON.stringify(stats)}::jsonb WHERE id = ${job.id}`;
        done++;
        continue;
      }
      if (job.type === "rebuild") {
        const index_rows = await constructIndex(q);
        const stats = { index_rows, vintage: (job.payload as { vintage?: string }).vintage || "provisional" };
        clearIndexCache();
        await q`UPDATE pipeline_jobs SET status = 'ok', finished_at = NOW(), stats = ${JSON.stringify(stats)}::jsonb WHERE id = ${job.id}`;
        done++;
        continue;
      }
      const stats = await runPipeline({ ...job.payload, runId: job.id }, q, shutdown);
      const pending = (stats.coverage.jobs.pending || 0) > 0;
      await q`UPDATE pipeline_jobs SET status = ${pending ? "queued" : "ok"}, finished_at = ${pending ? null : new Date().toISOString()}, stats = ${JSON.stringify(stats)}::jsonb WHERE id = ${job.id}`;
      done++;
      if (pending) return done;
    } catch (err) {
      const error = String(err).slice(0, 2000);
      const busy = error.includes("Collection lock busy");
      await q`UPDATE pipeline_jobs SET status = ${busy ? "queued" : "error"}, finished_at = ${busy ? null : new Date().toISOString()}, error = ${error} WHERE id = ${job.id}`;
      if (busy) return done;
    } finally { clearInterval(heartbeat); }
  }
}
