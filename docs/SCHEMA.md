# Data Warehouse Schema & Ingest Formats

OpusAirs stores airfare observations in PostgreSQL (Neon serverless). Both automated scrapers and manual data dumps feed into `quotes_raw`, which is then processed through cleaning stages into `quotes_clean` and summarized into `index_values`.

SQL Reference: [data/schema.sql](../data/schema.sql)

`quote_snapshots` freezes one economy one-way fare per basket route, lead-time bin, and snapshot slot (`0600`, `1800`, `adhoc`). `pipeline_jobs` tracks ingest, collect, and rebuild. `index_revisions` stores provisional and final vintages. `quotes_raw` and `quotes_clean` carry `source_rank` (airline 10–20, compliant OTA 30, manual 40, unknown 90). `index_values` adds `coverage`, `vintage`, `n_routes`, and `n_quotes`.

---

## 1. Relational Tables

### `quotes_raw`
Raw observations collected from airline sites, OTAs, or manual uploads.
- Unique Upsert Constraint:
  ```sql
  UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
  ```
- Submitting an identical key updates the existing record with the latest fare.

### `quotes_clean`
Cleaned fares used for index compilation and search comparison:
- Excludes status `sold_out`, `missing`, `blocked`, and `cancelled`.
- Imputes missing fare components (base, taxes, UDF, convenience) using standardized airline proportions.
- Flags and filters outliers (`is_outlier = 1`) using Median Absolute Deviation (MAD), falling back to Interquartile Range (IQR).

### `index_values`
Computed Airfare Price Index time series:
- `series`: `apix_laspeyres` (weighted basket), `apix_jevons` (unweighted), `apix_t21` (21-day advance), or `apix_route` (route relatives).
- `frequency`: `daily`, `weekly`, `monthly`.
- `period_date`: Reference date.
- `value`: Normalized index value ($100.0$ at base date `APIX_BASE_DATE`).
- `imputed_share`: Proportion of route cells carried forward due to missing observations.

### `basket_routes`
Fixed market basket populated from `data/psd_basket.csv` containing city pairs (e.g. `DEL-BOM`, `DEL-BLR`) and passenger traffic weights.

### `collection_runs`
Audit log recording every scraper execution and manual ingest batch.

### Durable collection control
- `collection_settings`: singleton pricing mode (`tinyfish`, `http`, `offline`) and Browser/Agent/runtime caps. Changes apply to future enqueues; job payloads retain a settings snapshot.
- `collection_schedules`: once/daily starts as `TIMESTAMPTZ`, recurrence, transport, status, operator, and latest queued job. Admin inputs/display use IST. No schedule is automatically seeded.
- `collection_workers`: contributor identity, label, current job, heartbeat, and nonsecret readiness. Presence expires after 30 seconds.
- `collection_worker_lease`: singleton owner/heartbeat serializes worker execution and remote-resource recovery; stale after five minutes.
- `pipeline_jobs`: persisted inputs/settings, status, progress JSON, cancellation request, worker ID, stats/errors, and start/heartbeat/finish times. Terminal statuses include `ok`, `error`, and `cancelled`.
- `pipeline_job_events`: bounded-size phase messages and sampled cell events keyed to a job, ordered by ID. Every cell outcome remains in `collect_jobs`/`collect_attempts`; progress percentage is not fare coverage.
- `collect_budget`: crash-durable paid reservations, Browser session IDs/deletion confirmation, Agent IDs/terminal state, and per-source phases/errors. Credentials and CDP connection URLs are never stored here.

Bootstrap applies idempotent DDL under a database advisory lock; `data/schema.sql` mirrors the migration contract. Due-schedule enqueue, cancellation, and duplicate run submissions use the settings row as a transaction lock.

---

## 2. Ingest Formats

### CSV Format (`POST /v1/ingest/csv` and Admin File Upload)
Header row is required. Download template via `GET /v1/ingest/template` or [data/quotes_manual.example.csv](../data/quotes_manual.example.csv).

| Column | Required | Example | Description |
|---|---|---|---|
| `source` | No | `manual` | Source identifier (`indigo`, `airindia`, `manual`, `makemytrip`, etc.) |
| `origin` | **Yes** | `DEL` | 3-letter IATA origin airport code |
| `destination` | **Yes** | `BOM` | 3-letter IATA destination airport code |
| `carrier` | **Yes** | `6E` | 2-letter IATA airline code (`6E`, `AI`, `QP`, `SG`, `IX`) |
| `flight_no` | No | `6E201` | Flight number (defaults to `NA`) |
| `dep_date` | **Yes** | `2026-09-20` | Scheduled outbound departure (`YYYY-MM-DD`) |
| `return_date` | Round trip | `2026-09-27` | Return date for `trip_type=round_trip` |
| `trip_type` | No | `one_way` | `one_way` or `round_trip` (APIx uses one-way only) |
| `fare_class` | No | `ECONOMY` | Cabin class (defaults to `ECONOMY`) |
| `lead_time_days` | No | `7` | Advance purchase days ($dep\_date - collected\_on$ if omitted) |
| `collected_on` | No | `2026-09-13` | Date fare was observed (defaults to current date) |
| `base_fare` | No | `3800` | Base fare in INR |
| `taxes` | No | `450` | Government and airport taxes in INR |
| `udf` | No | `250` | User Development Fee in INR |
| `convenience` | No | `0` | Booking convenience fee in INR |
| `total_fare` | Conditional | `4500` | Total traveller fare (required if `base_fare` is absent) |
| `status` | No | `ok` | `ok` \| `sold_out` \| `missing` \| `blocked` \| `cancelled` |

### JSON Format (`POST /v1/ingest/quotes` and Admin JSON Dump)

```json
{
  "rebuild_index": true,
  "quotes": [
    {
      "source": "manual",
      "origin": "DEL",
      "destination": "BOM",
      "carrier": "6E",
      "flight_no": "6E201",
      "dep_date": "2026-09-20",
      "fare_class": "ECONOMY",
      "lead_time_days": 7,
      "collected_on": "2026-09-13",
      "base_fare": 3800,
      "taxes": 450,
      "udf": 250,
      "convenience": 0,
      "total_fare": 4500,
      "status": "ok"
    }
  ]
}
```

---

## 3. Data Flow to Consumer Features

```
quotes_raw
    │
    ▼ (cleanQuotes: dedup, split components, MAD filter)
quotes_clean
    ├─────────────────────────────┬─────────────────────────────┐
    ▼                             ▼                             ▼
GET /v1/search               GET /v1/trends              constructIndex()
(Cheapest fare by carrier    (Historical fare movement    (Jevons elementary →
 on selected city pair)       & 30d/3m/6m price gain)     Laspeyres index_values)
```
