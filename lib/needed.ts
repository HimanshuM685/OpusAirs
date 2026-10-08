import { loadBasket, LEAD_TIMES } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import { addDays, istDate } from "./collect/policy";

export type NeededCell = {
  origin: string; destination: string; trip_type: "one_way"; fare_class: "ECONOMY";
  lead_time_days: number; snapshot_slot: string; last_collected_on: string | null; hint: string; dump_line: string;
};

export async function neededQuotes(q: ReturnType<typeof sqlFn>): Promise<NeededCell[]> {
  const basket = await loadBasket(q);
  const rows = (await q`SELECT origin, destination, lead_time_bin, snapshot_slot, MAX(collected_on) AS last_on
    FROM quote_snapshots WHERE is_imputed = 0 AND is_synthetic = false AND total_fare > 0
      AND UPPER(fare_class) = 'ECONOMY' AND trip_type = 'one_way'
    GROUP BY origin, destination, lead_time_bin, snapshot_slot`) as { origin: string; destination: string; lead_time_bin: number; snapshot_slot: string; last_on: string }[];
  const today = istDate();
  const weekAgo = addDays(today, -7);
  const last = new Map(rows.map((r) => [`${r.origin}|${r.destination}|${r.lead_time_bin}|${r.snapshot_slot}`, isoDate(r.last_on)]));
  const slots = [...new Set((process.env.SNAPSHOT_HOURS || '6').split(',').map((h) => h.trim()))]
    .filter((h) => h === '6' || h === '18').map((h) => h === '6' ? '0600' : '1800');
  return basket.flatMap((route) => LEAD_TIMES.flatMap((lead) => slots.flatMap((slot) => {
    const date = last.get(`${route.origin}|${route.destination}|${lead}|${slot}`) || null;
    if (date && date >= weekAgo) return [];
    return [{ origin: route.origin, destination: route.destination, trip_type: "one_way" as const, fare_class: "ECONOMY" as const,
      lead_time_days: lead, snapshot_slot: slot, last_collected_on: date,
      hint: `${date ? `Stale (${date})` : "Empty"}: ${route.origin}→${route.destination} T+${lead}, ${slot} IST. Supply an allowed observation.`,
      dump_line: ["manual", route.origin, route.destination, "NA", "NA", addDays(today, lead), "", "one_way", lead, today, "", "", "", "", "<total_fare>", "ok"].join(",") }];
  })));
}
