import { randomUUID } from "node:crypto";
import type { sql as sqlFn } from "./db";

type Q = ReturnType<typeof sqlFn>;
export type JobType = "ingest" | "collect" | "discover" | "clean" | "rebuild" | "bulletin" | "snapshot";

export async function enqueue(
  q: Q,
  type: JobType,
  payload: unknown,
  dedupeKey?: string,
): Promise<string> {
  const id = randomUUID();
  const rows = await q`
    INSERT INTO pipeline_jobs (id, type, status, payload, dedupe_key)
    VALUES (${id}, ${type}, 'queued', ${JSON.stringify(payload ?? {})}::jsonb, ${dedupeKey ?? null})
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
    RETURNING id
  `;
  // Worker owns execution. Never detach work with setImmediate: Vercel may freeze
  // the function as soon as this HTTP response is returned.
  return String(rows[0].id);
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
