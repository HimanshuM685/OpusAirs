import type { sql as sqlFn } from "../db";
import { isoDate } from "../db";
import { loadBasket } from "../bootstrap";
import { HORIZON_DAYS, addDays } from "./policy";
import type { CollectCell, CollectJob, CollectStatus } from "./types";
import { catalogRoutes, type CatalogRoute } from "./catalog";

type Q = ReturnType<typeof sqlFn>;

export const LEAD_ORDER = [21, 7, 1, 15, 30, 45] as const;
export function departureOperates(mask: number, depDate: string): boolean {
  const dow = new Date(`${depDate}T00:00:00Z`).getUTCDay();
  return Boolean(mask & (1 << ((dow + 6) % 7)));
}
export function buildWorklist(routes: { origin: string; destination: string; weight?: number }[], day: string,
  catalog: CatalogRoute[] = [], carrier?: string): CollectCell[] {
  const pairs = new Map(routes.filter((r) => r.origin !== r.destination).map((r) => [`${r.origin}|${r.destination}`, { ...r, inBasket: true }]));
  const schedules = catalog.filter((r) => r.active && (!carrier || r.carrier === carrier));
  for (const r of schedules) if (!pairs.has(`${r.origin}|${r.destination}`)) pairs.set(`${r.origin}|${r.destination}`, { ...r, weight: 0, inBasket: false });
  return [...pairs.values()].sort((a, b) => Number(b.inBasket) - Number(a.inBasket) || (b.weight || 0) - (a.weight || 0)
    || a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination)).flatMap((r) => LEAD_ORDER
    .filter((lead) => r.inBasket || schedules.some((s) => s.origin === r.origin && s.destination === r.destination && departureOperates(s.dow_mask, addDays(day, lead))))
    .map((lead) => ({
    origin: r.origin, destination: r.destination, depDate: addDays(day, lead), leadTimeDays: lead,
    fareClass: "ECONOMY" as const, tripType: "one_way" as const,
    weight: r.weight || 0, inBasket: r.inBasket, carrier,
  })));
}

export async function acquireLock(q: Q, maxHours: number, owner: string): Promise<"acquired" | "busy"> {
  const cutoff = new Date(Date.now() - maxHours * 3600000).toISOString();
  const rows = await q`
    INSERT INTO collect_lock (id, started_at, status, owner) VALUES (1, NOW(), 'running', ${owner})
    ON CONFLICT (id) DO UPDATE SET started_at = NOW(), status = 'running', owner = EXCLUDED.owner
    WHERE collect_lock.status <> 'running' OR collect_lock.started_at < ${cutoff}
    RETURNING id
  `;
  return rows.length ? "acquired" : "busy";
}

export async function releaseLock(q: Q, owner: string): Promise<void> {
  await q`UPDATE collect_lock SET status = 'idle', owner = NULL WHERE id = 1 AND owner = ${owner}`;
}

export async function expandJobs(q: Q, opts: {
  collectedOn: string; snapshotAt: string; slot: string; sources: string[];
  routes?: { origin: string; destination: string }[];
  carriers?: Record<string, string>;
}): Promise<number> {
  // The official basket is always present, including when an admin supplies extra pairs.
  const basket = [...(await loadBasket(q)), ...(opts.routes || [])];
  const catalog = await catalogRoutes(q);
  const cells = buildWorklist(basket, opts.collectedOn, catalog);
  const work = opts.sources.flatMap((source) => buildWorklist(basket, opts.collectedOn, catalog, opts.carriers?.[source])
    .map((cell, work_order) => ({ source, work_order, ...cell })));
  if (work.length) await q`
    INSERT INTO collect_jobs (collected_on, snapshot_at, snapshot_slot, source, origin, destination, dep_date, trip_type, work_order)
    SELECT ${opts.collectedOn}::date, ${opts.snapshotAt}::timestamptz, ${opts.slot}, x.source, x.origin,
      x.destination, x."depDate"::date, 'one_way', x.work_order
    FROM jsonb_to_recordset(${JSON.stringify(work)}::jsonb) AS x(source text, origin text, destination text, "depDate" text, work_order int)
    ON CONFLICT (snapshot_at, source, origin, destination, dep_date, trip_type) DO NOTHING
  `;
  return cells.length;
}

export async function reclaimStale(q: Q, snapshotAt: string): Promise<void> {
  await q`UPDATE collect_jobs SET status = 'pending', locked_at = NULL
    WHERE snapshot_at = ${snapshotAt} AND status = 'running'`;
}

export async function claimNext(q: Q, snapshotAt: string, source: string): Promise<CollectJob | null> {
  const rows = (await q`
    UPDATE collect_jobs SET status = 'running', locked_at = NOW(), attempts = attempts + 1
    WHERE id = (SELECT id FROM collect_jobs WHERE snapshot_at = ${snapshotAt} AND source = ${source}
      AND status = 'pending' ORDER BY work_order, id FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING *
  `) as Record<string, unknown>[];
  const r = rows[0];
  return r ? { id: Number(r.id), collected_on: isoDate(r.collected_on), source: String(r.source),
    origin: String(r.origin), destination: String(r.destination), dep_date: isoDate(r.dep_date),
    return_date: null, trip_type: "one_way", attempts: Number(r.attempts),
    snapshot_at: new Date(String(r.snapshot_at)).toISOString(), snapshot_slot: String(r.snapshot_slot) } : null;
}

export async function pendingJobs(q: Q, snapshotAt: string, source: string): Promise<CollectJob[]> {
  const rows = (await q`SELECT * FROM collect_jobs WHERE snapshot_at = ${snapshotAt} AND source = ${source}
    AND status = 'pending' ORDER BY work_order, id`) as Record<string, unknown>[];
  return rows.map((r) => ({ id: Number(r.id), collected_on: isoDate(r.collected_on), source,
    origin: String(r.origin), destination: String(r.destination), dep_date: isoDate(r.dep_date), return_date: null,
    trip_type: "one_way", attempts: Number(r.attempts), snapshot_at: snapshotAt, snapshot_slot: String(r.snapshot_slot) }));
}

export function needsRefresh(cell: CollectCell, observations: { origin: string; destination: string; dep_date: string; collected_at: string }[], now = Date.now()): boolean {
  return !observations.some((r) => r.origin === cell.origin && r.destination === cell.destination && isoDate(r.dep_date) === cell.depDate
    && now - Date.parse(r.collected_at) >= 0 && now - Date.parse(r.collected_at) < 36 * 3600000);
}

export async function finishJob(q: Q, id: number, status: string, error = ""): Promise<void> {
  await q`UPDATE collect_jobs SET status = ${status}, locked_at = NULL, last_error = ${error.slice(0, 500)} WHERE id = ${id}`;
}

export async function recordAttempt(q: Q, input: {
  jobId: number; source: string; host: string; status: string; http: number | null; quotes: number; error: string;
}): Promise<void> {
  await q`INSERT INTO collect_attempts (job_id, source, host, status, http_code, quote_count, error)
    VALUES (${input.jobId}, ${input.source}, ${input.host}, ${input.status}, ${input.http}, ${input.quotes}, ${input.error.slice(0, 500)})`;
}

export async function jobSummary(q: Q, day: string, snapshotAt?: string): Promise<Record<string, number>> {
  const rows = (await q`SELECT status, COUNT(*)::int AS n FROM collect_jobs
    WHERE collected_on = ${day} AND (${snapshotAt ?? null}::timestamptz IS NULL OR snapshot_at = ${snapshotAt ?? null})
    GROUP BY status`) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export function cellResultStatus(status: CollectStatus): string {
  return status === "ok" ? "done" : status;
}
