import type { sql as sqlFn } from "../db";
import { runPipeline, type PipelineOpts } from "./run";

export async function runCollectJobs(q: ReturnType<typeof sqlFn>): Promise<number> {
  await q`UPDATE pipeline_jobs SET status = 'queued', started_at = NULL
    WHERE type = 'collect' AND status = 'running' AND COALESCE(heartbeat_at, started_at) < NOW() - INTERVAL '5 minutes'`;
  let done = 0;
  for (;;) {
    const rows = (await q`
      UPDATE pipeline_jobs SET status = 'running', started_at = NOW(), heartbeat_at = NOW(), error = NULL
      WHERE id = (SELECT id FROM pipeline_jobs WHERE type = 'collect' AND status = 'queued'
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id, payload
    `) as { id: string; payload: PipelineOpts }[];
    const job = rows[0];
    if (!job) return done;
    const heartbeat = setInterval(() => {
      void q`UPDATE pipeline_jobs SET heartbeat_at = NOW() WHERE id = ${job.id} AND status = 'running'`.catch(console.error);
    }, 30000);
    heartbeat.unref();
    try {
      const stats = await runPipeline(job.payload);
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
