import { LEAD_BINS, nearestBin } from "./index-math";
import { loadPsdBasket } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import { sourceRank } from "./ingest";

type Q = ReturnType<typeof sqlFn>;

export function snapshotStamp(day: string, slot: string): string {
  if (slot === "0600") return `${day}T00:30:00.000Z`;
  if (slot === "1800") return `${day}T12:30:00.000Z`;
  return `${day}T00:30:00.000Z`;
}

export function slotForNow(now = new Date()): "0600" | "1800" {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.getUTCHours() < 12 ? "0600" : "1800";
}

export async function buildSnapshots(q: Q, slot: string): Promise<number> {
  const basket = new Set(loadPsdBasket().map((r) => `${r.origin}|${r.destination}`));
  const rows = (await q`
    SELECT id, origin, destination, lead_time_days, carrier, source, source_rank, fare_class,
           trip_type, total_fare, collected_on, is_outlier
    FROM quotes_clean
    WHERE UPPER(fare_class) = 'ECONOMY' AND COALESCE(trip_type, 'one_way') = 'one_way'
  `) as {
    id: number;
    origin: string;
    destination: string;
    lead_time_days: number;
    carrier: string;
    source: string;
    source_rank: number;
    total_fare: number;
    collected_on: string;
    is_outlier: number;
  }[];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.origin}|${row.destination}|${nearestBin(row.lead_time_days)}|${isoDate(row.collected_on)}`;
    if (basket.size && !basket.has(`${row.origin}|${row.destination}`)) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const days = [...new Set([...groups.keys()].map((k) => k.split("|")[3]))];
  for (const day of days) {
    const at = snapshotStamp(day, slot);
    await q`
      DELETE FROM quote_snapshots
      WHERE snapshot_slot = ${slot} AND collected_on = ${day}
    `;
    for (const lead of LEAD_BINS) {
      for (const pair of basket) {
        const [origin, destination] = pair.split("|");
        const list = groups.get(`${origin}|${destination}|${lead}|${day}`) ?? [];
        const clean = list.filter((r) => !r.is_outlier);
        const pool = clean.length ? clean : list;
        if (!pool.length) continue;
        pool.sort((a, b) => (a.source_rank || sourceRank(a.source)) - (b.source_rank || sourceRank(b.source)));
        const best = pool[0];
        const onlyOutlier = !clean.length;
        await q`
          INSERT INTO quote_snapshots (
            snapshot_at, snapshot_slot, origin, destination, lead_time_bin, carrier, source, source_rank,
            fare_class, trip_type, total_fare, collected_on, quote_id, is_imputed, impute_method
          ) VALUES (
            ${at}, ${slot}, ${origin}, ${destination}, ${lead}, ${best.carrier}, ${best.source},
            ${best.source_rank || sourceRank(best.source)}, 'ECONOMY', 'one_way', ${best.total_fare},
            ${day}, ${best.id}, ${onlyOutlier ? 1 : 0}, ${onlyOutlier ? "outlier_only" : null}
          )
          ON CONFLICT (snapshot_at, origin, destination, lead_time_bin, fare_class, trip_type)
          DO UPDATE SET
            source = EXCLUDED.source,
            source_rank = EXCLUDED.source_rank,
            total_fare = EXCLUDED.total_fare,
            quote_id = EXCLUDED.quote_id,
            snapshot_slot = EXCLUDED.snapshot_slot,
            is_imputed = EXCLUDED.is_imputed,
            impute_method = EXCLUDED.impute_method
        `;
      }
    }
  }
  return groups.size;
}
