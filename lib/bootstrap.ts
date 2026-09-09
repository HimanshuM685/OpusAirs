import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir, sql } from "./db";
import {
  DEFAULT_BASKET_ROUTES,
  DEFAULT_DGCA_BENCHMARK,
  DEFAULT_SCRAPE_SOURCES,
} from "./seeds";

export const LEAD_TIMES = [1, 7, 15, 21, 30, 45] as const;
export const FARE_CLASS = "ECONOMY";
export const APIX_BASE_DATE = process.env.APIX_BASE_DATE || "2026-08-01";

export type RouteSpec = {
  origin: string;
  destination: string;
  raw_passengers: number;
  weight: number;
  note: string;
};

export function loadPsdBasket(): RouteSpec[] {
  try {
    const text = readFileSync(join(dataDir(), "psd_basket.csv"), "utf8");
    const lines = text.trim().split(/\r?\n/);
    const rows: { origin: string; destination: string; raw_passengers: number; note: string }[] = [];
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const [origin, destination, raw, ...rest] = line.split(",");
      rows.push({
        origin: origin.trim().toUpperCase(),
        destination: destination.trim().toUpperCase(),
        raw_passengers: Number(raw),
        note: rest.join(",").replace(/^"|"$/g, "").trim(),
      });
    }
    const total = rows.reduce((s, r) => s + r.raw_passengers, 0) || 1;
    return rows.map((r) => ({ ...r, weight: r.raw_passengers / total }));
  } catch {
    const total = DEFAULT_BASKET_ROUTES.reduce((s, r) => s + r.raw_passengers, 0) || 1;
    return DEFAULT_BASKET_ROUTES.map((r) => ({
      origin: r.origin,
      destination: r.destination,
      raw_passengers: r.raw_passengers,
      note: r.note,
      weight: r.raw_passengers / total,
    }));
  }
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS basket_routes (
    id SERIAL PRIMARY KEY,
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    raw_passengers DOUBLE PRECISION NOT NULL,
    weight DOUBLE PRECISION NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS scrape_sources (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    carrier VARCHAR(8),
    enabled BOOLEAN NOT NULL DEFAULT true,
    start_url TEXT,
    search_url_template TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS collection_runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    source VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    quotes_ok INTEGER NOT NULL DEFAULT 0,
    quotes_missing INTEGER NOT NULL DEFAULT 0,
    quotes_sold_out INTEGER NOT NULL DEFAULT 0,
    quotes_blocked INTEGER NOT NULL DEFAULT 0,
    notes VARCHAR(1000) NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS quotes_raw (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES collection_runs(id),
    source VARCHAR(64) NOT NULL,
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    carrier VARCHAR(8) NOT NULL,
    flight_no VARCHAR(16) NOT NULL,
    dep_date DATE NOT NULL,
    fare_class VARCHAR(32) NOT NULL DEFAULT 'ECONOMY',
    lead_time_days INTEGER NOT NULL,
    collected_on DATE NOT NULL,
    collected_at TIMESTAMP NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ok',
    base_fare DOUBLE PRECISION,
    taxes DOUBLE PRECISION,
    udf DOUBLE PRECISION,
    convenience DOUBLE PRECISION,
    total_fare DOUBLE PRECISION,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
  )`,
  `CREATE TABLE IF NOT EXISTS quotes_clean (
    id SERIAL PRIMARY KEY,
    raw_id INTEGER REFERENCES quotes_raw(id),
    source VARCHAR(64) NOT NULL,
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    carrier VARCHAR(8) NOT NULL,
    flight_no VARCHAR(16) NOT NULL,
    dep_date DATE NOT NULL,
    fare_class VARCHAR(32) NOT NULL DEFAULT 'ECONOMY',
    lead_time_days INTEGER NOT NULL,
    collected_on DATE NOT NULL,
    base_fare DOUBLE PRECISION NOT NULL,
    taxes DOUBLE PRECISION NOT NULL,
    udf DOUBLE PRECISION NOT NULL,
    convenience DOUBLE PRECISION NOT NULL,
    total_fare DOUBLE PRECISION NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    is_outlier INTEGER NOT NULL DEFAULT 0,
    is_imputed INTEGER NOT NULL DEFAULT 0,
    UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
  )`,
  `CREATE TABLE IF NOT EXISTS index_values (
    id SERIAL PRIMARY KEY,
    series VARCHAR(64) NOT NULL,
    frequency VARCHAR(16) NOT NULL,
    period_date DATE NOT NULL,
    origin VARCHAR(3),
    destination VARCHAR(3),
    value DOUBLE PRECISION NOT NULL,
    imputed_share DOUBLE PRECISION NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS dgca_benchmark (
    id SERIAL PRIMARY KEY,
    month DATE NOT NULL,
    origin VARCHAR(3),
    destination VARCHAR(3),
    metric VARCHAR(64) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    note VARCHAR(500) NOT NULL DEFAULT ''
  )`,
];

let bootstrapped = false;

export async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  const q = sql();
  for (const stmt of DDL) {
    const strings = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
    await q(strings);
  }

  // 1. Basket routes seed
  const basketCount = (await q`SELECT COUNT(*) as count FROM basket_routes`) as { count: string | number }[];
  if (Number(basketCount[0]?.count || 0) === 0) {
    const basket = loadPsdBasket();
    for (const r of basket) {
      await q`
        INSERT INTO basket_routes (origin, destination, raw_passengers, weight, note)
        VALUES (${r.origin}, ${r.destination}, ${r.raw_passengers}, ${r.weight}, ${r.note})
      `;
    }
  }

  // 2. Scrape sources seed
  const sourcesCount = (await q`SELECT COUNT(*) as count FROM scrape_sources`) as { count: string | number }[];
  if (Number(sourcesCount[0]?.count || 0) === 0) {
    for (const s of DEFAULT_SCRAPE_SOURCES) {
      await q`
        INSERT INTO scrape_sources (id, name, carrier, enabled, start_url, search_url_template)
        VALUES (${s.id}, ${s.name}, ${s.carrier}, ${s.enabled}, ${s.start_url}, ${s.search_url_template})
      `;
    }
  }

  // 3. DGCA Benchmark seed
  const dgcaCount = (await q`SELECT COUNT(*) as count FROM dgca_benchmark`) as { count: string | number }[];
  if (Number(dgcaCount[0]?.count || 0) === 0) {
    let benchmarks = DEFAULT_DGCA_BENCHMARK;
    try {
      const dgcaPath = join(dataDir(), "dgca_benchmark.csv");
      const text = readFileSync(dgcaPath, "utf8");
      const parsed: typeof DEFAULT_DGCA_BENCHMARK = [];
      for (const line of text.trim().split(/\r?\n/).slice(1)) {
        if (!line.trim()) continue;
        const parts = line.split(",");
        parsed.push({
          month: parts[0].trim(),
          origin: parts[1].trim() || null,
          destination: parts[2].trim() || null,
          metric: parts[3].trim(),
          value: Number(parts[4]),
          note: parts.slice(5).join(",").replace(/^"|"$/g, "").trim(),
        });
      }
      if (parsed.length) benchmarks = parsed;
    } catch {
      /* fallback to DEFAULT_DGCA_BENCHMARK */
    }

    for (const b of benchmarks) {
      await q`
        INSERT INTO dgca_benchmark (month, origin, destination, metric, value, note)
        VALUES (${b.month}, ${b.origin}, ${b.destination}, ${b.metric}, ${b.value}, ${b.note})
      `;
    }
  }

  bootstrapped = true;
}
