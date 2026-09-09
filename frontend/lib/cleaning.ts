export function parseAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const text = String(value).replace(/,/g, "").replace(/₹/g, "").replace(/INR/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

export function splitFareComponents(input: {
  base_fare?: number | null;
  taxes?: number | null;
  udf?: number | null;
  convenience?: number | null;
  total_fare?: number | null;
}): { base_fare: number; taxes: number; udf: number; convenience: number; total_fare: number } | null {
  let total = parseAmount(input.total_fare);
  let base = parseAmount(input.base_fare);
  let tax = parseAmount(input.taxes) ?? 0;
  let u = parseAmount(input.udf) ?? 0;
  let conv = parseAmount(input.convenience) ?? 0;
  if (total == null && base == null) return null;
  if (base == null && total != null) {
    tax = Math.round(total * 0.12 * 100) / 100;
    u = Math.round(total * 0.04 * 100) / 100;
    conv = Math.round(total * 0.02 * 100) / 100;
    base = Math.round((total - tax - u - conv) * 100) / 100;
  } else if (total == null && base != null) {
    total = Math.round((base + tax + u + conv) * 100) / 100;
  } else {
    const reconstructed = Math.round(((base ?? 0) + tax + u + conv) * 100) / 100;
    if (Math.abs(reconstructed - (total ?? 0)) > 5) total = reconstructed;
  }
  if (total == null || total <= 0 || (base ?? 0) <= 0) return null;
  return { base_fare: base as number, taxes: tax, udf: u, convenience: conv, total_fare: total };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] * (hi - idx) + s[hi] * (idx - lo);
}

export function madFlags(values: number[], cutoff = 3.5): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const med = median(values);
  const absDev = values.map((v) => Math.abs(v - med));
  const mad = median(absDev);
  if (mad === 0) {
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) return values.map(() => false);
    return values.map((v) => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr);
  }
  return values.map((v) => Math.abs(v - med) / (1.4826 * mad) > cutoff);
}

export type RawQuote = {
  id: number;
  source: string;
  origin: string;
  destination: string;
  carrier: string;
  flight_no: string;
  dep_date: string;
  fare_class: string;
  lead_time_days: number;
  collected_on: string;
  status: string;
  base_fare: number | null;
  taxes: number | null;
  udf: number | null;
  convenience: number | null;
  total_fare: number | null;
};

export async function cleanQuotes(q: ReturnType<typeof import("./db").sql>): Promise<number> {
  const raw = (await q`SELECT * FROM quotes_raw`) as RawQuote[];
  await q`DELETE FROM quotes_clean`;
  const grouped = new Map<string, { raw: RawQuote; parts: NonNullable<ReturnType<typeof splitFareComponents>> }[]>();
  for (const row of raw) {
    if (["sold_out", "cancelled", "blocked", "missing"].includes(row.status)) continue;
    const parts = splitFareComponents(row);
    if (!parts) continue;
    const key = `${row.origin}|${row.destination}|${row.lead_time_days}`;
    const list = grouped.get(key) ?? [];
    list.push({ raw: row, parts });
    grouped.set(key, list);
  }
  const seen = new Set<string>();
  let written = 0;
  for (const items of grouped.values()) {
    const flags = madFlags(items.map((i) => i.parts.total_fare));
    for (let i = 0; i < items.length; i++) {
      const { raw: r, parts } = items[i];
      const dedupe = [r.source, r.origin, r.destination, r.carrier, r.flight_no, r.dep_date, r.fare_class, r.collected_on, r.lead_time_days].join("|");
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      await q`
        INSERT INTO quotes_clean (
          raw_id, source, origin, destination, carrier, flight_no, dep_date, fare_class,
          lead_time_days, collected_on, base_fare, taxes, udf, convenience, total_fare, is_outlier, is_imputed
        ) VALUES (
          ${r.id}, ${r.source}, ${r.origin}, ${r.destination}, ${r.carrier}, ${r.flight_no}, ${r.dep_date},
          ${r.fare_class}, ${r.lead_time_days}, ${r.collected_on}, ${parts.base_fare}, ${parts.taxes},
          ${parts.udf}, ${parts.convenience}, ${parts.total_fare}, ${flags[i] ? 1 : 0}, 0
        )
        ON CONFLICT (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
        DO UPDATE SET
          base_fare = EXCLUDED.base_fare,
          taxes = EXCLUDED.taxes,
          udf = EXCLUDED.udf,
          convenience = EXCLUDED.convenience,
          total_fare = EXCLUDED.total_fare,
          is_outlier = EXCLUDED.is_outlier
      `;
      written += 1;
    }
  }
  return written;
}

export async function lowestEconomyCells(
  q: ReturnType<typeof import("./db").sql>,
): Promise<Map<string, number>> {
  const rows = (await q`SELECT origin, destination, collected_on, lead_time_days, total_fare FROM quotes_clean WHERE is_outlier = 0`) as {
    origin: string;
    destination: string;
    collected_on: string;
    lead_time_days: number;
    total_fare: number;
  }[];
  const cells = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.origin}|${r.destination}|${String(r.collected_on).slice(0, 10)}|${r.lead_time_days}`;
    const prev = cells.get(key);
    if (prev == null || r.total_fare < prev) cells.set(key, r.total_fare);
  }
  return cells;
}
