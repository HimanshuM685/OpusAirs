import { randomUUID } from "node:crypto";
import type { sql as sqlFn } from "./db";
import { clearIndexCache } from "./http-cache";

type Q = ReturnType<typeof sqlFn>;
export type JobType = "ingest" | "collect" | "clean" | "rebuild" | "bulletin" | "snapshot";

const listeners = new Set<() => void>();
export function onJobOk(fn: () => void): void {
  listeners.add(fn);
}

export async function enqueue(
  q: Q,
  type: JobType,
  payload: unknown,
  run: () => Promise<Record<string, unknown>>,
): Promise<string> {
  const id = randomUUID();
  await q`
    INSERT INTO pipeline_jobs (id, type, status, payload)
    VALUES (${id}, ${type}, 'queued', ${JSON.stringify(payload ?? {})}::jsonb)
  `;
  setImmediate(async () => {
    await q`UPDATE pipeline_jobs SET status = 'running', started_at = NOW() WHERE id = ${id}`;
    try {
      const stats = await run();
      await q`
        UPDATE pipeline_jobs
        SET status = 'ok', finished_at = NOW(), stats = ${JSON.stringify(stats)}::jsonb
        WHERE id = ${id}
      `;
      if (type === "rebuild") {
        clearIndexCache();
        for (const fn of listeners) fn();
      }
    } catch (err) {
      await q`
        UPDATE pipeline_jobs
        SET status = 'error', finished_at = NOW(), error = ${String(err).slice(0, 2000)}
        WHERE id = ${id}
      `;
    }
  });
  return id;
}

export async function readJob(q: Q, id: string) {
  const rows = (await q`SELECT id, type, status, stats, error, created_at, started_at, finished_at FROM pipeline_jobs WHERE id = ${id} LIMIT 1`) as Record<string, unknown>[];
  return rows[0] ?? null;
}

export async function recentJobs(q: Q, limit = 20) {
  return (await q`
    SELECT id, type, status, stats, error, created_at, started_at, finished_at
    FROM pipeline_jobs ORDER BY created_at DESC LIMIT ${limit}
  `) as Record<string, unknown>[];
}
