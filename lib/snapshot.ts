import { LEAD_BINS, nearestBin } from "./index-math";
import { loadBasket } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import { sourceRank } from "./ingest";
import { addDays, istDate } from "./collect/policy";
import { snapshotRoutes } from "./collect/catalog";

type Q = ReturnType<typeof sqlFn>;
export type SnapshotOptions = { day?: string; slot?: string; snapshotAt?: string; includeSynthetic?: boolean };
export type SnapshotQuote = {
  id?: number; raw_id?: number; origin: string; destination: string; lead_time_days: number; carrier: string;
  source: string; source_rank?: number; fare_class?: string; trip_type?: string;
  total_fare: number; collected_on: string; collected_at?: string; is_outlier?: number; snapshot_at?: string | null; parser_accepted?: boolean;
};
export type SnapshotCell = {
  origin: string; destination: string; lead_time_bin: number; carrier: string | null;
  source: string; source_rank: number; total_fare: number | null; quote_id: number | null;
  is_imputed: number; impute_method: string | null; is_synthetic: boolean;
};

export function snapshotStamp(day: string, slot: string): string {
  if (slot === "0600") return `${day}T00:30:00.000Z`;
  if (slot === "1800") return `${day}T12:30:00.000Z`;
  return new Date().toISOString();
}

export function slotForNow(now = new Date()): "0600" | "1800" {
  return new Date(now.getTime() + 5.5 * 3600000).getUTCHours() < 12 ? "0600" : "1800";
}

const synthetic = (q: { source: string }) => q.source === "synthetic" || q.source === "synthetic_demo";
const eligible = (q: SnapshotQuote, includeSynthetic: boolean) => (q.fare_class || "ECONOMY").toUpperCase() === "ECONOMY"
  && (q.trip_type || "one_way") === "one_way" && Number(q.total_fare) > 0 && (includeSynthetic || !synthetic(q));

export function pickSnapshotCells(basket: { origin: string; destination: string }[], quotes: SnapshotQuote[],
  day: string, snapshotAt: string, includeSynthetic = false, previous: (SnapshotCell & { collected_on: string; snapshot_at?: string })[] = [], slot = "adhoc",
  nationalPairs = new Set(basket.map((r) => `${r.origin}|${r.destination}`))): SnapshotCell[] {
  snapshotAt = new Date(snapshotAt).toISOString();
  const pairs = new Set(basket.map((r) => `${r.origin}|${r.destination}`));
  const current = quotes.filter((q) => q.parser_accepted !== false && eligible(q, includeSynthetic) && isoDate(q.collected_on) === day
    && (!q.snapshot_at || new Date(q.snapshot_at).toISOString() === snapshotAt) && pairs.has(`${q.origin}|${q.destination}`)
    && (!(slot === "0600" || slot === "1800") || !["manual", "csv", "file_drop"].includes(q.source) || !q.collected_at
      || (istDate(new Date(q.collected_at)) === day && slotForNow(new Date(q.collected_at)) === slot)));
  const clean = current.filter((q) => !q.is_outlier && !synthetic(q));
  const sortedFares = clean.filter((q) => nationalPairs.has(`${q.origin}|${q.destination}`)).map((q) => Number(q.total_fare)).sort((a, b) => a - b);
  const mid = Math.floor(sortedFares.length / 2);
  const median = !sortedFares.length ? null : sortedFares.length % 2 ? sortedFares[mid] : (sortedFares[mid - 1] + sortedFares[mid]) / 2;
  return basket.flatMap((r) => LEAD_BINS.map((lead) => {
    const exact = current.filter((q) => q.origin === r.origin && q.destination === r.destination && nearestBin(q.lead_time_days) === lead)
      .sort((a, b) => Number(Boolean(a.is_outlier)) - Number(Boolean(b.is_outlier))
        || (a.source_rank ?? sourceRank(a.source)) - (b.source_rank ?? sourceRank(b.source)) || Number(a.total_fare) - Number(b.total_fare));
    const best = exact[0];
    if (best) return { origin: r.origin, destination: r.destination, lead_time_bin: lead, carrier: best.carrier,
      source: best.source, source_rank: best.source_rank ?? sourceRank(best.source), total_fare: Number(best.total_fare),
      quote_id: best.raw_id || best.id || null, is_imputed: best.is_outlier || synthetic(best) ? 1 : 0,
      impute_method: synthetic(best) ? "synthetic_demo" : best.is_outlier ? "outlier_only" : null, is_synthetic: synthetic(best) };
    const adjacent = clean.filter((q) => q.origin === r.origin && q.destination === r.destination)
      .sort((a, b) => Math.abs(a.lead_time_days - lead) - Math.abs(b.lead_time_days - lead))[0];
    const old = previous.filter((q) => q.origin === r.origin && q.destination === r.destination && q.lead_time_bin === lead
      && q.total_fare != null && q.collected_on >= addDays(day, -7) && q.collected_on <= day && (includeSynthetic || !q.is_synthetic))
      .sort((a, b) => (b.snapshot_at || b.collected_on).localeCompare(a.snapshot_at || a.collected_on))[0];
    const fare = adjacent ? Number(adjacent.total_fare) : old?.total_fare ?? median;
    return { origin: r.origin, destination: r.destination, lead_time_bin: lead, carrier: null,
      source: "imputed", source_rank: 999, total_fare: fare, quote_id: null, is_imputed: 1,
      impute_method: adjacent ? "adjacent_lead" : old ? "carry_forward" : median != null ? "route_median" : "unavailable",
      is_synthetic: old?.is_synthetic ?? false };
  }));
}

export function coverageForCells(basket: { origin: string; destination: string; weight: number }[], cells: SnapshotCell[]) {
  let total = 0; let observed = 0; let observedCells = 0;
  for (const route of basket) {
    const weight = Number(route.weight);
    total += weight;
    const count = LEAD_BINS.filter((lead) => cells.some((c) => c.origin === route.origin && c.destination === route.destination
      && c.lead_time_bin === lead && !c.is_imputed && !c.is_synthetic && c.total_fare != null)).length;
    observed += weight * count / LEAD_BINS.length;
    observedCells += weight * count / LEAD_BINS.length;
  }
  const coverage = total ? Math.round(Math.min(1, observed / total) * 1e12) / 1e12 : 0;
  const cellCoverage = total ? Math.round(Math.min(1, observedCells / total) * 1e12) / 1e12 : 0;
  return { coverage, cell_coverage: cellCoverage, imputed_share: 1 - cellCoverage,
    vintage: cells.some((c) => c.is_synthetic) ? "demo" : coverage < 0.6 ? "provisional" : "final",
    quality: coverage < 0.6 ? "low" : coverage < 0.8 ? "partial" : "good",
    target_met: coverage >= 0.8, cells: cells.length,
    observed_cells: cells.filter((c) => !c.is_imputed && !c.is_synthetic && c.total_fare != null).length,
    unavailable_cells: cells.filter((c) => c.total_fare == null).length };
}

export async function buildSnapshots(q: Q, options: SnapshotOptions | string = {}): Promise<number> {
  const opts = typeof options === "string" ? { slot: options } : options;
  const day = opts.day || istDate();
  const slot = opts.slot || "adhoc";
  const at = new Date(opts.snapshotAt || snapshotStamp(day, slot)).toISOString();
  const basket = await loadBasket(q);
  const routes = await snapshotRoutes(q);
  const rows = (await q`SELECT c.*, r.collected_at, r.snapshot_at, r.parser_accepted FROM quotes_clean c JOIN quotes_raw r ON r.id = c.raw_id
    WHERE UPPER(c.fare_class) = 'ECONOMY' AND COALESCE(c.trip_type, 'one_way') = 'one_way' AND c.collected_on = ${day}`) as SnapshotQuote[];
  const previous = (await q`SELECT * FROM quote_snapshots WHERE collected_on >= ${addDays(day, -7)} AND snapshot_at < ${at}`) as (SnapshotCell & { collected_on: string })[];
  for (const row of previous) row.collected_on = isoDate(row.collected_on);
  const cells = pickSnapshotCells(routes, rows, day, at, opts.includeSynthetic, previous, slot, new Set(basket.map((r) => `${r.origin}|${r.destination}`)));
  await q`
    INSERT INTO quote_snapshots (snapshot_at, snapshot_slot, origin, destination, lead_time_bin, carrier, source, source_rank,
      fare_class, trip_type, total_fare, collected_on, quote_id, is_imputed, impute_method, is_synthetic)
    SELECT ${at}::timestamptz, ${slot}, x.origin, x.destination, x.lead_time_bin, x.carrier, x.source, x.source_rank,
      'ECONOMY', 'one_way', x.total_fare, ${day}::date, x.quote_id, x.is_imputed, x.impute_method, x.is_synthetic
    FROM jsonb_to_recordset(${JSON.stringify(cells)}::jsonb) AS x(origin text, destination text, lead_time_bin int, carrier text,
      source text, source_rank int, total_fare double precision, quote_id int, is_imputed int, impute_method text, is_synthetic boolean)
    ON CONFLICT (snapshot_at, origin, destination, lead_time_bin, fare_class, trip_type) DO UPDATE SET
      total_fare = EXCLUDED.total_fare, source = EXCLUDED.source, source_rank = EXCLUDED.source_rank,
      carrier = EXCLUDED.carrier, quote_id = EXCLUDED.quote_id, is_imputed = EXCLUDED.is_imputed,
      impute_method = EXCLUDED.impute_method, is_synthetic = EXCLUDED.is_synthetic
  `;
  return cells.length;
}

export async function snapshotCoverage(q: Q, snapshotAt: string) {
  const cells = (await q`SELECT * FROM quote_snapshots WHERE snapshot_at = ${snapshotAt}`) as SnapshotCell[];
  return coverageForCells(await loadBasket(q), cells);
}
