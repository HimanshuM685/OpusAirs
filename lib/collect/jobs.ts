import type { sql as sqlFn } from "../db";
import { isoDate } from "../db";
import { loadAirports } from "./airports";
import { HORIZON_DAYS, addDays, isLockStale } from "./policy";
import type { CollectJob } from "./types";

type Q = ReturnType<typeof sqlFn>;

function asJob(row: Record<string, unknown>): CollectJob {
  const trip = row.trip_type === "round_trip" ? "round_trip" : "one_way";
  return {
    id: Number(row.id),
    collected_on: isoDate(row.collected_on),
    source: String(row.source),
    origin: String(row.origin),
    destination: String(row.destination),
    dep_date: isoDate(row.dep_date),
    return_date: row.return_date ? isoDate(row.return_date) : null,
    trip_type: trip,
    attempts: Number(row.attempts || 0),
  };
}

export async function acquireLock(q: Q, maxHours: number): Promise<"acquired" | "busy"> {
  const rows = (await q`SELECT started_at, status FROM collect_lock WHERE id = 1`) as {
    started_at: string;
    status: string;
  }[];
  const row = rows[0];
  if (row?.status === "running" && !isLockStale(row.started_at, new Date(), maxHours * 60)) return "busy";
  const now = new Date().toISOString();
  if (!row) {
    try {
      await q`INSERT INTO collect_lock (id, started_at, status) VALUES (1, ${now}, 'running')`;
    } catch {
      return "busy";
    }
  } else {
    await q`UPDATE collect_lock SET started_at = ${now}, status = 'running' WHERE id = 1`;
  }
  return "acquired";
}

export async function releaseLock(q: Q): Promise<void> {
  await q`UPDATE collect_lock SET status = 'idle' WHERE id = 1`;
}

export async function reclaimStale(q: Q): Promise<void> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await q`
    UPDATE collect_jobs
    SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
        locked_at = NULL
    WHERE status = 'running' AND locked_at IS NOT NULL AND locked_at < ${cutoff}
  `;
}

export async function expandJobs(
  q: Q,
  opts: { collectedOn: string; sources: string[]; routes?: { origin: string; destination: string }[] },
): Promise<void> {
  let routes = opts.routes?.map((r) => ({
    origin: r.origin.toUpperCase(),
    destination: r.destination.toUpperCase(),
  }));
  if (!routes?.length) {
    const rows = (await q`
      SELECT origin, destination FROM collect_routes ORDER BY priority, origin, destination
    `) as { origin: string; destination: string }[];
    routes = rows;
  } else {
    const day = opts.collectedOn;
    for (const r of routes) {
      await q`
        INSERT INTO collect_routes (origin, destination, priority, discovered_on)
        VALUES (${r.origin}, ${r.destination}, 1, ${day})
        ON CONFLICT (origin, destination) DO NOTHING
      `;
    }
  }
  for (const source of opts.sources) {
    for (const route of routes) {
      if (route.origin === route.destination) continue;
      for (const trip of ["one_way", "round_trip"] as const) {
        for (const lead of HORIZON_DAYS) {
          const dep = addDays(opts.collectedOn, lead);
          const ret = trip === "round_trip" ? addDays(dep, 7) : null;
          await q`
            INSERT INTO collect_jobs (
              collected_on, source, origin, destination, dep_date, return_date, trip_type, status, attempts, last_error
            ) VALUES (
              ${opts.collectedOn}, ${source}, ${route.origin}, ${route.destination}, ${dep}, ${ret}, ${trip}, 'pending', 0, ''
            )
            ON CONFLICT (collected_on, source, origin, destination, dep_date, trip_type)
            DO UPDATE SET status = 'pending', locked_at = NULL
            WHERE collect_jobs.status = 'failed' AND collect_jobs.attempts < 3
          `;
        }
      }
    }
  }
}

export async function countStatus(q: Q, day: string, status: string): Promise<number> {
  const rows = (await q`
    SELECT COUNT(*)::int AS n FROM collect_jobs WHERE collected_on = ${day} AND status = ${status}
  `) as { n: number }[];
  return Number(rows[0]?.n || 0);
}

export async function claimNext(q: Q, day: string): Promise<CollectJob | null> {
  const now = new Date().toISOString();
  const rows = (await q`
    UPDATE collect_jobs SET status = 'running', locked_at = ${now}, attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM collect_jobs j
      LEFT JOIN collect_routes r ON r.origin = j.origin AND r.destination = j.destination
      WHERE j.status = 'pending' AND j.collected_on = ${day}
      ORDER BY COALESCE(r.priority, 1), j.id
      LIMIT 1
    )
    RETURNING id, collected_on, source, origin, destination, dep_date, return_date, trip_type, attempts
  `) as Record<string, unknown>[];
  return rows[0] ? asJob(rows[0]) : null;
}

export async function finishJob(q: Q, id: number, status: string, error = ""): Promise<void> {
  await q`
    UPDATE collect_jobs
    SET status = ${status}, locked_at = NULL, last_error = ${error.slice(0, 500)}
    WHERE id = ${id}
  `;
}

export async function recordAttempt(
  q: Q,
  input: { jobId: number; source: string; host: string; status: string; http: number | null; quotes: number; error: string },
): Promise<void> {
  await q`
    INSERT INTO collect_attempts (job_id, source, host, status, http_code, quote_count, error)
    VALUES (
      ${input.jobId}, ${input.source}, ${input.host.slice(0, 255)}, ${input.status},
      ${input.http}, ${input.quotes}, ${input.error.slice(0, 500)}
    )
  `;
}

export async function jobSummary(q: Q, day: string): Promise<Record<string, number>> {
  const rows = (await q`
    SELECT status, COUNT(*)::int AS n FROM collect_jobs WHERE collected_on = ${day} GROUP BY status
  `) as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export async function rememberRoutes(
  q: Q,
  pairs: { origin: string; destination: string }[],
  day: string,
): Promise<void> {
  const airports = loadAirports();
  if (!airports.size) return;
  for (const pair of pairs) {
    const origin = pair.origin.toUpperCase();
    const destination = pair.destination.toUpperCase();
    if (!airports.has(origin) || !airports.has(destination) || origin === destination) continue;
    await q`
      INSERT INTO collect_routes (origin, destination, priority, discovered_on)
      VALUES (${origin}, ${destination}, 1, ${day})
      ON CONFLICT (origin, destination) DO NOTHING
    `;
  }
}
