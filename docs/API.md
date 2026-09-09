# OpusAirs /v1 REST API Reference

Base URL: Unified Next.js application origin (e.g., `http://localhost:3000` locally, or your production domain). No separate backend URL or API key required.

---

## Summary of Endpoints

| Method | Endpoint | Description |
|---|---|---|
| **GET** | `/v1/index` | Retrieve aggregate Airfare Price Index (APIx) time series. |
| **GET** | `/v1/index/routes/{origin}/{dest}` | Retrieve route-specific APIx relative index series. |
| **GET** | `/v1/search` | Search flights between origin and destination; compare carrier fares. |
| **GET** | `/v1/trends/{origin}/{dest}` | Historical fare trends and price gain/loss over 30d, 3m, 6m, or all. |
| **GET** | `/v1/routes` | Active basket routes with weight, latest index, and recent fare. |
| **GET** | `/v1/heatmap` | Lead-time booking heatmap across advance-purchase days. |
| **GET** | `/v1/elasticity` | Price elasticity curves by advance purchase window. |
| **GET** | `/v1/quotes` | Filterable raw/cleaned fare quotes from the data warehouse. |
| **GET** | `/v1/health/collection` | Scraping engine status and health metrics per source. |
| **POST** | `/v1/collect/run` | Trigger collection pipeline (portal scraping + clean + index). |
| **POST** | `/v1/ingest/quotes` | Direct JSON quote batch dump with optional auto-rebuild. |
| **POST** | `/v1/ingest/csv` | Multipart CSV quote file upload with optional auto-rebuild. |
| **GET** | `/v1/ingest/template` | Download CSV template for manual quote ingestion. |
| **POST** | `/v1/index/rebuild` | Manually run data cleaning and recompute index series. |
| **GET** | `/v1/backtest/dgca` | Compare monthly APIx against published DGCA TMU benchmark. |

---

## Detailed Endpoint Documentation

### 1. Airfare Price Index

#### `GET /v1/index`
Returns aggregate Airfare Price Index series calculated using elementary Jevons prices aggregated across routes.

**Query Parameters:**
- `frequency` (optional, default `daily`): `daily` | `weekly` | `monthly`
- `series` (optional, default `apix_laspeyres`):
  - `apix_laspeyres`: Passenger-weighted Laspeyres index (base=100)
  - `apix_jevons`: Unweighted geometric mean across routes
  - `apix_t21`: Laspeyres index restricted to 21-day advance purchase (MoSPI CPI 2024 specification)

**Example Response:**
```json
[
  {
    "series": "apix_laspeyres",
    "frequency": "daily",
    "period_date": "2026-08-01",
    "origin": null,
    "destination": null,
    "value": 100.0,
    "imputed_share": 0.0
  }
]
```

#### `GET /v1/index/routes/{origin}/{dest}`
Returns route-level price index relatives.

**Path Parameters:**
- `origin`: 3-letter IATA code (e.g. `DEL`)
- `dest`: 3-letter IATA code (e.g. `BOM`)

**Query Parameters:**
- `frequency` (optional, default `daily`): `daily` | `weekly` | `monthly`

---

### 2. Flight Search & Price Comparison

#### `GET /v1/search`
Compares fares across carriers operating the selected city pair.

**Query Parameters:**
- `origin` (required): Origin airport code (e.g. `DEL`)
- `dest` (required): Destination airport code (e.g. `BOM`)

If `quote_count` is 0 and the caller has an `opus_session` cookie, the API scrapes that pair (skipped if scraped in the last 15 minutes) and returns `fetched: true`.

**Example Response:**
```json
{
  "origin": "DEL",
  "destination": "BOM",
  "cheapest": 4500,
  "quotes_count": 12,
  "carriers": [
    {
      "source": "indigo",
      "carrier": "6E",
      "flight_no": "6E201",
      "dep_date": "2026-09-20",
      "lead_time_days": 7,
      "base_fare": 3800,
      "taxes": 450,
      "udf": 250,
      "convenience": 0,
      "total_fare": 4500,
      "collected_on": "2026-09-13"
    },
    {
      "source": "airindia",
      "carrier": "AI",
      "flight_no": "AI101",
      "dep_date": "2026-09-20",
      "lead_time_days": 7,
      "base_fare": 4200,
      "taxes": 500,
      "udf": 250,
      "convenience": 0,
      "total_fare": 4950,
      "collected_on": "2026-09-13"
    }
  ]
}
```

#### `GET /v1/trends/{origin}/{dest}`
Historical fare movement for calculating price gain/loss over chosen lookback windows.

**Path Parameters:**
- `origin`: Origin airport code (e.g. `DEL`)
- `dest`: Destination airport code (e.g. `BOM`)

**Query Parameters:**
- `window` (optional, default `30d`): `30d` (last 30 days) | `3m` (last 3 months) | `6m` (last 6 months) | `all`

**Example Response:**
```json
[
  {
    "period_date": "2026-08-15",
    "avg_fare": 4720.5,
    "min_fare": 4200.0,
    "max_fare": 5800.0,
    "quote_count": 8
  },
  {
    "period_date": "2026-09-10",
    "avg_fare": 5150.0,
    "min_fare": 4500.0,
    "max_fare": 6200.0,
    "quote_count": 10
  }
]
```

---

### 3. Analytics & Basket

#### `GET /v1/routes`
Lists all active basket pairs from `data/psd_basket.csv` with their passenger weights, current index, and latest fare.

#### `GET /v1/heatmap`
Returns average fare across routes grouped by lead times (1, 7, 15, 21, 30, 45 days).

**Query Parameters:**
- `origin` (optional): Filter by origin
- `dest` (optional): Filter by destination

#### `GET /v1/elasticity`
Returns pricing curves and mean fare by advance purchase lead-time bucket.

---

### 4. Admin, Scraping & Ingestion

#### `GET /v1/health/collection`
Returns status of recent collection and scraper executions per source.

**Example Response:**
```json
[
  {
    "source": "indigo",
    "last_started_at": "2026-09-10T00:00:00.000Z",
    "last_finished_at": "2026-09-10T00:03:15.000Z",
    "status": "ok",
    "quotes_ok": 18,
    "quotes_missing": 2,
    "quotes_sold_out": 0,
    "quotes_blocked": 0,
    "notes": "Finished portal scrape"
  }
]
```

#### `POST /v1/collect/run`
Admin cookie required. Body `{ "origin": "CCU", "dest": "BOM" }` scrapes that pair; omit O/D to scrape the full basket. `scrape=true|false` query still works.

#### `POST /v1/ingest/quotes`
Ingests an array of raw quote objects.

**Request Body:**
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
      "total_fare": 4850,
      "status": "ok"
    }
  ]
}
```

#### `POST /v1/ingest/csv`
Uploads a multipart CSV quote file (`file` field).
- Query parameter: `rebuild_index=true|false` (default `true`).

#### `GET /v1/ingest/template`
Returns standard CSV template header and sample row with `Content-Type: text/csv`.

#### `POST /v1/index/rebuild`
Re-runs outlier cleaning (`quotes_clean`) and reconstructs daily/weekly/monthly indices in `index_values`.

#### `GET /v1/backtest/dgca`
Compares computed APIx against the DGCA TMU published 72-route benchmark (`data/dgca_benchmark.csv`).

---

### 5. Auth

#### `POST /v1/auth/register`
Creates a `users` row (email + scrypt hash). Sets `opus_session` cookie.

#### `POST /v1/auth/login`
Email + password. Cookie `opus_session=id.hmac`.

#### `POST /v1/auth/logout`
Clears the session cookie.

#### `GET /v1/auth/me`
`{ authenticated, user?: { id, email, role } }`

#### `POST /v1/admin/login`
Same as login but requires `role=admin`. Body `{ "email", "password" }`.

#### `POST /v1/admin/logout` / `GET /v1/admin/check`
Logout and `{ authenticated }` for admin role.
