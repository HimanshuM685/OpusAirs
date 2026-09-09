import { loadPsdBasket } from "./bootstrap";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";
import type { TripType } from "./ingest";

const NEED_LEADS = [1, 7, 21] as const;
const TRIPS: TripType[] = ["one_way", "round_trip"];

export type NeededCell = {
  origin: string;
  destination: string;
  trip_type: TripType;
  lead_time_days: number;
  last_collected_on: string | null;
  hint: string;
  dump_line: string;
};

export async function neededQuotes(q: ReturnType<typeof sqlFn>): Promise<NeededCell[]> {
  const basket = loadPsdBasket();
  const rows = (await q`
    SELECT origin, destination, lead_time_days, trip_type, MAX(collected_on) AS last_on
    FROM quotes_clean
    WHERE is_outlier = 0
    GROUP BY origin, destination, lead_time_days, trip_type
  `) as {
    origin: string;
    destination: string;
    lead_time_days: number;
    trip_type: string | null;
    last_on: string;
  }[];

  const lastMap = new Map<string, string>();
  for (const r of rows) {
    const trip = r.trip_type === "round_trip" ? "round_trip" : "one_way";
    lastMap.set(`${r.origin}|${r.destination}|${trip}|${r.lead_time_days}`, isoDate(r.last_on));
  }

  const out: NeededCell[] = [];
  for (const route of basket) {
    for (const trip of TRIPS) {
      for (const lead of NEED_LEADS) {
        const key = `${route.origin}|${route.destination}|${trip}|${lead}`;
        const last = lastMap.get(key) || null;
        if (last && last >= weekAgo) continue;
        const dep = new Date(`${today}T00:00:00Z`);
        dep.setUTCDate(dep.getUTCDate() + lead);
        const depStr = dep.toISOString().slice(0, 10);
        const ret =
          trip === "round_trip"
            ? new Date(dep.getTime() + 7 * 86400000).toISOString().slice(0, 10)
            : "";
        out.push({
          origin: route.origin,
          destination: route.destination,
          trip_type: trip,
          lead_time_days: lead,
          last_collected_on: last,
          hint: last
            ? `Stale (${last}). Collect ${trip.replace("_", " ")} ${route.origin}→${route.destination} T+${lead}`
            : `Missing ${trip.replace("_", " ")} ${route.origin}→${route.destination} T+${lead}. Need origin, dest, dep_date, total_fare, trip_type.`,
          dump_line: [
            "manual",
            route.origin,
            route.destination,
            "NA",
            "NA",
            depStr,
            ret,
            trip,
            String(lead),
            today,
            "",
            "",
            "",
            "",
            "<total_fare>",
            "ok",
          ].join(","),
        });
      }
    }
  }
  return out;
}
