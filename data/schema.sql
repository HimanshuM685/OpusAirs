-- OpusAirs APIx warehouse (PostgreSQL / Neon)
-- create_all() also builds this on API boot. Use this file as the contract
-- for manual loads (psql, Neon SQL editor, spreadsheet export).

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

CREATE INDEX IF NOT EXISTS ix_quotes_raw_route ON quotes_raw (origin, destination, collected_on);
CREATE INDEX IF NOT EXISTS ix_quotes_clean_route ON quotes_clean (origin, destination, collected_on);
CREATE INDEX IF NOT EXISTS ix_index_series ON index_values (series, frequency, period_date);
