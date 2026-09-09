import { constructIndex } from "./apix";
import { FARE_CLASS } from "./bootstrap";
import { cleanQuotes } from "./cleaning";
import type { sql as sqlFn } from "./db";
import { isoDate } from "./db";

export type QuoteIn = {
  source?: string;
  origin: string;
  destination: string;
  carrier: string;
  flight_no?: string;
  dep_date: string;
  return_date?: string | null;
  trip_type?: string;
  fare_class?: string;
  lead_time_days?: number | null;
  collected_on?: string | null;
  base_fare?: number | null;
  taxes?: number | null;
  udf?: number | null;
  convenience?: number | null;
  total_fare?: number | null;
  status?: string;
};

export type TripType = "one_way" | "round_trip";

export function normalizeTripType(raw?: string | null): TripType {
  const t = (raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "round_trip" || t === "roundtrip" || t === "return" || t === "rt") return "round_trip";
  return "one_way";
}

export function uniqueFlightNo(flightNo: string | undefined, trip: TripType): string {
  const fn = ((flightNo || "NA").trim() || "NA").replace(/^RT\//, "");
  if (trip === "round_trip") return `RT/${fn}`.slice(0, 16);
  return fn.slice(0, 16);
}

export function displayFlightNo(flightNo: unknown): string {
  return String(flightNo ?? "").replace(/^RT\//, "") || "NA";
}

export type CollectionEvent = QuoteIn & {
  source: string;
  flight_no: string;
  fare_class: string;
  lead_time_days: number;
  collected_on: string;
  collected_at: string;
  status: string;
  trip_type: TripType;
};

function toEvent(q: QuoteIn): CollectionEvent {
  const collected_on = q.collected_on || new Date().toISOString().slice(0, 10);
  let lead = q.lead_time_days;
  if (lead == null) {
    const dep = new Date(`${q.dep_date}T00:00:00Z`);
    const col = new Date(`${collected_on}T00:00:00Z`);
    lead = Math.round((dep.getTime() - col.getTime()) / 86400000);
  }
  const trip_type = normalizeTripType(q.trip_type);
  return {
    ...q,
    source: (q.source || "manual").trim() || "manual",
    origin: q.origin.trim().toUpperCase(),
    destination: q.destination.trim().toUpperCase(),
    carrier: q.carrier.trim().toUpperCase(),
    flight_no: uniqueFlightNo(q.flight_no, trip_type),
    fare_class: (q.fare_class || FARE_CLASS).replace(/_RT$/i, "").trim() || FARE_CLASS,
    lead_time_days: Number(lead),
    collected_on,
    collected_at: new Date().toISOString(),
    status: (q.status || "ok").trim() || "ok",
    trip_type,
    return_date: q.return_date ? isoDate(q.return_date) : null,
  };
}

export async function upsertEvents(
  q: ReturnType<typeof sqlFn>,
  events: CollectionEvent[],
  runId: number | null,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    inserted: 0,
    updated: 0,
    ok: 0,
    missing: 0,
    sold_out: 0,
    blocked: 0,
    cancelled: 0,
  };
  for (const ev of events) {
    counts[ev.status] = (counts[ev.status] ?? 0) + 1;
    const existing = await q`
      SELECT id FROM quotes_raw
      WHERE source = ${ev.source} AND origin = ${ev.origin} AND destination = ${ev.destination}
        AND carrier = ${ev.carrier} AND flight_no = ${ev.flight_no} AND dep_date = ${isoDate(ev.dep_date)}
        AND fare_class = ${ev.fare_class} AND collected_on = ${isoDate(ev.collected_on)}
        AND lead_time_days = ${ev.lead_time_days}
      LIMIT 1
    `;
    if (!existing.length) {
      await q`
        INSERT INTO quotes_raw (
          run_id, source, origin, destination, carrier, flight_no, dep_date, fare_class,
          lead_time_days, collected_on, collected_at, status, base_fare, taxes, udf, convenience, total_fare, currency,
          trip_type, return_date
        ) VALUES (
          ${runId}, ${ev.source}, ${ev.origin}, ${ev.destination}, ${ev.carrier}, ${ev.flight_no},
          ${isoDate(ev.dep_date)}, ${ev.fare_class}, ${ev.lead_time_days}, ${isoDate(ev.collected_on)}, ${ev.collected_at},
          ${ev.status}, ${ev.base_fare ?? null}, ${ev.taxes ?? null}, ${ev.udf ?? null},
          ${ev.convenience ?? null}, ${ev.total_fare ?? null}, 'INR',
          ${ev.trip_type}, ${ev.return_date ?? null}
        )
      `;
      counts.inserted += 1;
    } else {
      await q`
        UPDATE quotes_raw SET
          status = ${ev.status},
          base_fare = ${ev.base_fare ?? null},
          taxes = ${ev.taxes ?? null},
          udf = ${ev.udf ?? null},
          convenience = ${ev.convenience ?? null},
          total_fare = ${ev.total_fare ?? null},
          collected_at = ${ev.collected_at},
          run_id = ${runId},
          trip_type = ${ev.trip_type},
          return_date = ${ev.return_date ?? null}
        WHERE id = ${existing[0].id}
      `;
      counts.updated += 1;
    }
  }
  return counts;
}

export async function ingestQuotes(
  q: ReturnType<typeof sqlFn>,
  quotes: QuoteIn[],
  rebuildIndex = true,
): Promise<Record<string, unknown>> {
  const events = quotes.map(toEvent);
  const started = new Date().toISOString();
  const run = await q`
    INSERT INTO collection_runs (started_at, source, status, quotes_ok, quotes_missing, quotes_sold_out, quotes_blocked, notes)
    VALUES (${started}, 'manual', 'running', 0, 0, 0, 0, '')
    RETURNING id
  `;
  const runId = Number(run[0].id);
  const counts = await upsertEvents(q, events, runId);
  let cleaned = 0;
  let indexed = 0;
  if (rebuildIndex) {
    cleaned = await cleanQuotes(q);
    indexed = await constructIndex(q);
  }
  const finished = new Date().toISOString();
  await q`
    UPDATE collection_runs SET
      finished_at = ${finished},
      status = 'ok',
      quotes_ok = ${counts.ok ?? 0},
      quotes_missing = ${counts.missing ?? 0},
      quotes_sold_out = ${counts.sold_out ?? 0},
      quotes_blocked = ${counts.blocked ?? 0},
      notes = ${`inserted=${counts.inserted} updated=${counts.updated}`}
    WHERE id = ${runId}
  `;
  return { source: "manual", received: events.length, ...counts, cleaned, index_rows: indexed };
}

function cell(row: Record<string, string>, ...names: string[]): string {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k) lower[k.trim().toLowerCase()] = v;
  }
  for (const name of names) {
    if (lower[name] != null && lower[name] !== "") return String(lower[name]).trim();
  }
  return "";
}

function optFloat(text: string): number | null {
  if (!text.trim()) return null;
  return Number(text.replace(/,/g, "").replace(/₹/g, "").trim());
}

export function parseCsvQuotes(text: string): QuoteIn[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const out: QuoteIn[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    const origin = cell(row, "origin", "from").toUpperCase();
    const dest = cell(row, "destination", "dest", "to").toUpperCase();
    if (!origin || !dest) continue;
    const dep = cell(row, "dep_date", "departure", "travel_date");
    if (!dep) continue;
    const leadRaw = cell(row, "lead_time_days", "lead_time", "tplus");
    const trip = normalizeTripType(cell(row, "trip_type", "trip", "journey"));
    const q: QuoteIn = {
      source: cell(row, "source") || "manual",
      origin,
      destination: dest,
      carrier: (cell(row, "carrier", "airline") || "NA").toUpperCase(),
      flight_no: cell(row, "flight_no", "flight") || "NA",
      dep_date: dep,
      return_date: cell(row, "return_date", "return") || null,
      trip_type: trip,
      fare_class: cell(row, "fare_class", "cabin") || FARE_CLASS,
      collected_on: cell(row, "collected_on", "collected", "quote_date") || new Date().toISOString().slice(0, 10),
      base_fare: optFloat(cell(row, "base_fare", "base")),
      taxes: optFloat(cell(row, "taxes", "tax")),
      udf: optFloat(cell(row, "udf")),
      convenience: optFloat(cell(row, "convenience", "conv_fee")),
      total_fare: optFloat(cell(row, "total_fare", "total", "fare")),
      status: cell(row, "status") || "ok",
    };
    if (leadRaw) q.lead_time_days = Number(leadRaw);
    out.push(q);
  }
  return out;
}
