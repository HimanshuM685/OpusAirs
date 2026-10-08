-- OpusAirs APIx warehouse (PostgreSQL / Neon)
-- create_all() also builds this on API boot. Use this file as the contract
-- for manual loads (psql, Neon SQL editor, spreadsheet export).

CREATE TABLE IF NOT EXISTS scrape_sources (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(128) NOT NULL, carrier VARCHAR(8),
  enabled BOOLEAN NOT NULL DEFAULT false, start_url TEXT, search_url_template TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS basket_routes (
  id SERIAL PRIMARY KEY,
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  raw_passengers DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS collection_runs (
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
);

-- Feed this table. Scrapers and POST /v1/ingest/* both write here.
CREATE TABLE IF NOT EXISTS quotes_raw (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES collection_runs(id),
  source VARCHAR(64) NOT NULL,          -- indigo | airindia | manual | csv | ...
  origin VARCHAR(3) NOT NULL,           -- IATA, e.g. DEL
  destination VARCHAR(3) NOT NULL,      -- IATA, e.g. BOM
  carrier VARCHAR(8) NOT NULL,          -- 6E | AI | IX | QP | SG
  flight_no VARCHAR(16) NOT NULL,       -- 6E201 or NA
  dep_date DATE NOT NULL,
  fare_class VARCHAR(32) NOT NULL DEFAULT 'ECONOMY',
  lead_time_days INTEGER NOT NULL,      -- 1,7,15,21,30,45
  collected_on DATE NOT NULL,           -- quote observation date
  collected_at TIMESTAMP NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ok',  -- ok | missing | sold_out | blocked | cancelled
  base_fare DOUBLE PRECISION,
  taxes DOUBLE PRECISION,
  udf DOUBLE PRECISION,
  convenience DOUBLE PRECISION,
  total_fare DOUBLE PRECISION,          -- what the traveller pays (INR)
  currency VARCHAR(8) NOT NULL DEFAULT 'INR',
  trip_type VARCHAR(16) NOT NULL DEFAULT 'one_way',  -- one_way | round_trip
  return_date DATE,
  UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
);

CREATE TABLE IF NOT EXISTS quotes_clean (
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
  trip_type VARCHAR(16) NOT NULL DEFAULT 'one_way',
  return_date DATE,
  UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
);

CREATE TABLE IF NOT EXISTS index_values (
  id SERIAL PRIMARY KEY,
  series VARCHAR(64) NOT NULL,          -- apix_laspeyres | apix_jevons | apix_t21 | apix_route
  frequency VARCHAR(16) NOT NULL,       -- daily | weekly | monthly
  period_date DATE NOT NULL,
  origin VARCHAR(3),
  destination VARCHAR(3),
  value DOUBLE PRECISION NOT NULL,
  imputed_share DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dgca_benchmark (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  origin VARCHAR(3),
  destination VARCHAR(3),
  metric VARCHAR(64) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS collect_routes (
  origin VARCHAR(3) NOT NULL,
  destination VARCHAR(3) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  discovered_on DATE,
  PRIMARY KEY (origin, destination)
);

CREATE TABLE IF NOT EXISTS collect_jobs (
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
);

CREATE TABLE IF NOT EXISTS collect_attempts (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES collect_jobs(id),
  source VARCHAR(64) NOT NULL,
  host VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  http_code INTEGER,
  quote_count INTEGER NOT NULL DEFAULT 0,
  error VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collect_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  started_at TIMESTAMP NOT NULL,
  status VARCHAR(16) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_quotes_raw_route ON quotes_raw (origin, destination, collected_on);
CREATE INDEX IF NOT EXISTS ix_quotes_clean_route ON quotes_clean (origin, destination, collected_on);
CREATE INDEX IF NOT EXISTS ix_index_series ON index_values (series, frequency, period_date);
CREATE INDEX IF NOT EXISTS ix_collect_jobs_status ON collect_jobs (collected_on, status);

ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS source_rank INTEGER NOT NULL DEFAULT 90;
ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS impute_method VARCHAR(32);
ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS source_rank INTEGER NOT NULL DEFAULT 90;
ALTER TABLE quotes_clean ADD COLUMN IF NOT EXISTS impute_method VARCHAR(32);
ALTER TABLE index_values ADD COLUMN IF NOT EXISTS coverage DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE index_values ADD COLUMN IF NOT EXISTS vintage VARCHAR(16) NOT NULL DEFAULT 'final';
ALTER TABLE index_values ADD COLUMN IF NOT EXISTS n_routes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE index_values ADD COLUMN IF NOT EXISTS n_quotes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_snapshots (
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
);

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id UUID PRIMARY KEY,
  type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  payload JSONB,
  stats JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS index_revisions (
  series VARCHAR(64) NOT NULL,
  frequency VARCHAR(16) NOT NULL,
  period_date DATE NOT NULL,
  vintage VARCHAR(16) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  imputed_share DOUBLE PRECISION NOT NULL DEFAULT 0,
  coverage DOUBLE PRECISION NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series, frequency, period_date, vintage)
);

-- Slot-aware collection upgrade; quotes_raw's existing unique key is retained.
ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS notes VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS quotes_blocked_robots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS quotes_errors INTEGER NOT NULL DEFAULT 0;
ALTER TABLE collect_jobs ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE collect_jobs ADD COLUMN IF NOT EXISTS snapshot_slot VARCHAR(16) NOT NULL DEFAULT 'legacy';
DO $$ DECLARE c RECORD; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'collect_jobs'::regclass
    AND contype = 'u' AND pg_get_constraintdef(oid) NOT LIKE '%snapshot_at%'
  LOOP EXECUTE format('ALTER TABLE collect_jobs DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_collect_jobs_snapshot ON collect_jobs
  (snapshot_at, source, origin, destination, dep_date, trip_type);
ALTER TABLE quote_snapshots ALTER COLUMN total_fare DROP NOT NULL;
ALTER TABLE quote_snapshots ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pipeline_jobs_dedupe ON pipeline_jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;
ALTER TABLE collect_lock ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE index_values ADD COLUMN IF NOT EXISTS quality VARCHAR(16) NOT NULL DEFAULT 'good';
ALTER TABLE scrape_sources ALTER COLUMN enabled SET DEFAULT false;

CREATE TABLE IF NOT EXISTS route_catalog (
  origin text NOT NULL,
  destination text NOT NULL,
  carrier text NOT NULL,
  flight_no text NOT NULL DEFAULT '', -- unknown flight numbers use ''; PK columns cannot be NULL
  dow_mask int NOT NULL DEFAULT 127, -- Mon=1 .. Sun=64
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  refreshed_on date NOT NULL,
  PRIMARY KEY (origin, destination, carrier, flight_no)
);
CREATE TABLE IF NOT EXISTS collect_budget (
  run_id uuid PRIMARY KEY,
  sessions_opened int NOT NULL DEFAULT 0,
  sessions_deleted int NOT NULL DEFAULT 0,
  agent_runs int NOT NULL DEFAULT 0,
  tinyfish_disabled boolean NOT NULL DEFAULT false,
  notes text
);
ALTER TABLE collect_budget ADD COLUMN IF NOT EXISTS session_attempts int NOT NULL DEFAULT 0;
ALTER TABLE collect_budget ADD COLUMN IF NOT EXISTS airlines jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE collect_budget ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT NOW();
ALTER TABLE pipeline_jobs ADD COLUMN IF NOT EXISTS vintage_note text;
ALTER TABLE quotes_raw ADD COLUMN IF NOT EXISTS parser_accepted boolean NOT NULL DEFAULT true;
ALTER TABLE collect_jobs ADD COLUMN IF NOT EXISTS work_order int NOT NULL DEFAULT 0;
