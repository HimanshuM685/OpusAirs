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

export async function loadBasket(q: ReturnType<typeof sql>): Promise<RouteSpec[]> {
  const rows = (await q`SELECT origin, destination, raw_passengers, weight, note FROM basket_routes`) as RouteSpec[];
  const merged = new Map(loadPsdBasket().map((r) => [`${r.origin}|${r.destination}`, r]));
  for (const row of rows) {
    const origin = row.origin.toUpperCase();
    const destination = row.destination.toUpperCase();
    merged.set(`${origin}|${destination}`, { ...row, origin, destination, raw_passengers: Number(row.raw_passengers), weight: Number(row.weight) });
  }
  const routes = [...merged.values()].filter((r) => r.origin !== r.destination);
  const total = routes.reduce((n, r) => n + Math.max(0, r.raw_passengers), 0);
  return routes.map((r) => ({ ...r, weight: total > 0 ? Math.max(0, r.raw_passengers) / total : 1 / routes.length }));
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
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
    enabled BOOLEAN NOT NULL DEFAULT false,
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
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS trip_type VARCHAR(16) NOT NULL DEFAULT 'one_way'`,
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS return_date DATE`,
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
  `ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS trip_type VARCHAR(16) NOT NULL DEFAULT 'one_way'`,
  `ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS return_date DATE`,
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
  `CREATE TABLE IF NOT EXISTS collect_routes (
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    discovered_on DATE,
    PRIMARY KEY (origin, destination)
  )`,
  `CREATE TABLE IF NOT EXISTS collect_jobs (
    id SERIAL PRIMARY KEY,
    collected_on DATE NOT NULL,
    source VARCHAR(64) NOT NULL,
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    dep_date DATE NOT NULL,
    return_date DATE,
    trip_type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_at TIMESTAMP,
    last_error VARCHAR(500) NOT NULL DEFAULT '',
    UNIQUE (collected_on, source, origin, destination, dep_date, trip_type)
  )`,
  `CREATE TABLE IF NOT EXISTS collect_attempts (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES collect_jobs(id),
    source VARCHAR(64) NOT NULL,
    host VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL,
    http_code INTEGER,
    quote_count INTEGER NOT NULL DEFAULT 0,
    error VARCHAR(500) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS collect_lock (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    started_at TIMESTAMP NOT NULL,
    status VARCHAR(16) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_collect_jobs_status ON collect_jobs (collected_on, status)`,
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS source_rank INTEGER NOT NULL DEFAULT 90`,
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS impute_method VARCHAR(32)`,
  `ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS source_rank INTEGER NOT NULL DEFAULT 90`,
  `ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS impute_method VARCHAR(32)`,
  `ALTER TABLE index_values ADD COLUMN IF NOT EXISTS coverage DOUBLE PRECISION NOT NULL DEFAULT 1`,
  `ALTER TABLE index_values ADD COLUMN IF NOT EXISTS vintage VARCHAR(16) NOT NULL DEFAULT 'final'`,
  `ALTER TABLE index_values ADD COLUMN IF NOT EXISTS n_routes INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE index_values ADD COLUMN IF NOT EXISTS n_quotes INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS quote_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_at TIMESTAMPTZ NOT NULL,
    snapshot_slot VARCHAR(16) NOT NULL,
    origin VARCHAR(3) NOT NULL,
    destination VARCHAR(3) NOT NULL,
    lead_time_bin INTEGER NOT NULL,
    carrier VARCHAR(8),
    source VARCHAR(64) NOT NULL,
    source_rank INTEGER NOT NULL DEFAULT 50,
    fare_class VARCHAR(32) NOT NULL DEFAULT 'ECONOMY',
    trip_type VARCHAR(16) NOT NULL DEFAULT 'one_way',
    total_fare DOUBLE PRECISION NOT NULL,
    collected_on DATE NOT NULL,
    quote_id INTEGER,
    is_imputed INTEGER NOT NULL DEFAULT 0,
    impute_method VARCHAR(32),
    UNIQUE (snapshot_at, origin, destination, lead_time_bin, fare_class, trip_type)
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_jobs (
    id UUID PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    status VARCHAR(16) NOT NULL,
    payload JSONB,
    stats JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS index_revisions (
    series VARCHAR(64) NOT NULL,
    frequency VARCHAR(16) NOT NULL,
    period_date DATE NOT NULL,
    vintage VARCHAR(16) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    imputed_share DOUBLE PRECISION NOT NULL DEFAULT 0,
    coverage DOUBLE PRECISION NOT NULL DEFAULT 1,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (series, frequency, period_date, vintage)
  )`,
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS notes VARCHAR(1000) NOT NULL DEFAULT ''`,
  `ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ`,
  `ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ`,
  `ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS quotes_blocked_robots INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS quotes_errors INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE collect_jobs ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE collect_jobs ADD COLUMN IF NOT EXISTS snapshot_slot VARCHAR(16) NOT NULL DEFAULT 'legacy'`,
  `DO $$ DECLARE c RECORD; BEGIN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'collect_jobs'::regclass
      AND contype = 'u' AND pg_get_constraintdef(oid) NOT LIKE '%snapshot_at%'
    LOOP EXECUTE format('ALTER TABLE collect_jobs DROP CONSTRAINT %I', c.conname); END LOOP;
  END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_collect_jobs_snapshot ON collect_jobs
    (snapshot_at, source, origin, destination, dep_date, trip_type)`,
  `ALTER TABLE quote_snapshots ALTER COLUMN total_fare DROP NOT NULL`,
  `ALTER TABLE quote_snapshots ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_pipeline_jobs_dedupe ON pipeline_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL`,
  `ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ`,
  `ALTER TABLE collect_lock ADD COLUMN IF NOT EXISTS owner TEXT`,
  `ALTER TABLE index_values ADD COLUMN IF NOT EXISTS quality VARCHAR(16) NOT NULL DEFAULT 'good'`,
  `ALTER TABLE scrape_sources ALTER COLUMN enabled SET DEFAULT false`,
];

let bootstrapped = false;

export async function bootstrap(db?: ReturnType<typeof sql>): Promise<void> {
  if (bootstrapped) return;
  const q = db || sql();
  // Web and collection worker can start together. Serialize schema + seeds in one
  // transaction, using an xact lock (session locks are unsuitable for Neon HTTP).
  const queries = [q`SELECT pg_advisory_xact_lock(77110001)`];
  for (const stmt of DDL) {
    const strings = Object.assign([stmt], { raw: [stmt] }) as unknown as TemplateStringsArray;
    queries.push(q(strings));
  }

  const basket = loadPsdBasket();
  for (const r of basket) {
    queries.push(q`
      INSERT INTO basket_routes (origin, destination, raw_passengers, weight, note)
      SELECT ${r.origin}, ${r.destination}, ${r.raw_passengers}, ${r.weight}, ${r.note}
      WHERE NOT EXISTS (SELECT 1 FROM basket_routes WHERE origin = ${r.origin} AND destination = ${r.destination})
    `);
  }

  for (const r of basket) {
    queries.push(q`
      INSERT INTO collect_routes (origin, destination, priority, discovered_on)
      VALUES (${r.origin}, ${r.destination}, 0, ${new Date().toISOString().slice(0, 10)})
      ON CONFLICT (origin, destination) DO NOTHING
    `);
  }

  // 2. Scrape sources seed
  for (const s of DEFAULT_SCRAPE_SOURCES) {
    queries.push(q`
      INSERT INTO scrape_sources (id, name, carrier, enabled, start_url, search_url_template)
      VALUES (${s.id}, ${s.name}, ${s.carrier}, ${s.enabled}, ${s.start_url}, ${s.search_url_template})
      ON CONFLICT (id) DO NOTHING
    `);
  }

  // 3. DGCA Benchmark seed
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

  queries.push(q`
    INSERT INTO dgca_benchmark (month, origin, destination, metric, value, note)
    SELECT x.month::date, x.origin, x.destination, x.metric, x.value, x.note
    FROM jsonb_to_recordset(${JSON.stringify(benchmarks)}::jsonb)
      AS x(month text, origin text, destination text, metric text, value double precision, note text)
    WHERE NOT EXISTS (SELECT 1 FROM dgca_benchmark)
  `);
  await q.transaction(queries, { isolationLevel: "ReadCommitted" });
  bootstrapped = true;
}
