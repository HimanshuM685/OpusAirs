# OpusAirs /v1 REST API Reference

Base URL: Unified Next.js application origin (e.g., `http://localhost:3000` locally, or your production domain). Browser requests use the same-origin Neon session; there is no separate backend URL.

## Authentication and Caching

- **User reads:** `GET /v1/index`, `/index/routes/{origin}/{dest}`, `/search`, `/trends/{origin}/{dest}`, `/routes`, `/heatmap`, `/elasticity`, `/quotes`, and `/health` require a live Neon session.
- **Operator endpoints:** Collection health/configuration/discovery, ingestion templates/gaps, backtests, and bulletins require a verified Google session whose email is in `ADMIN_EMAILS`.
- **Machine-writer exception:** `POST /v1/collect/run`, `/ingest/quotes`, `/ingest/csv`, `/ingest/dump`, `/index/rebuild`, and `GET /v1/jobs` or `/jobs/{id}` accept either an authorized operator session or `x-api-key` matching the configured, nonempty `INGEST_API_KEY`. That key does not grant access to other analytics/operator endpoints.
- **Session status:** `/v1/auth/me` and `/v1/admin/check` can be called anonymously and return authentication state without initializing the warehouse.

Unauthorized calls return **401**; authenticated users without operator access receive **403** on operator endpoints. Authorization runs before database bootstrap, warehouse queries, and response-cache lookup. API calls return JSON errors rather than login redirects. Protected pages redirect to `/login?next=...`.

All `/v1` responses use `Cache-Control: private, no-store`; do not add public CDN caching. Selected warehouse queries use a 20-second in-process cache after authorization. The browser separately shares eligible reads for up to 20 seconds in its own tab, never across server users. These TTLs can compound; completed worker writes are not instantly visible in another web process. Refresh invalidates the tab's entry, while server entries expire independently.

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
| **GET** | `/v1/health` | Signed-in snapshot/index health summary. |
| **POST** | `/v1/collect/run` | Trigger collection pipeline (portal scraping + clean + index). |
| **GET** | `/v1/collect/monitor?job=UUID` | Uncached contributor, run progress, source outcomes, events, and schedules. |
| **GET / POST** | `/v1/collect/control` | Read/save settings, schedule, cancel, or retry (Google operator only). |
| **POST** | `/v1/ingest/quotes` | Direct JSON quote batch dump with optional auto-rebuild. |
| **POST** | `/v1/ingest/csv` | Multipart CSV quote file upload with optional auto-rebuild. |
| **POST** | `/v1/ingest/dump` | Queue text or structured observations for worker parsing. |
| **GET** | `/v1/jobs`, `/v1/jobs/{id}` | Recent jobs or one job's durable status. |
| **GET** | `/v1/ingest/template` | Download CSV template for manual quote ingestion. |
| **POST** | `/v1/index/rebuild` | Queue index reconstruction from cleaned observations. |
| **GET** | `/v1/backtest/dgca` | Compare monthly APIx against published DGCA TMU benchmark. |
| **GET** | `/v1/bulletin` | Operator JSON/CSV bulletin extract. |

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
  - `apix_chain`, `apix_lowe`, `apix_economy`, `apix_fare_timing`, `apix_laspeyres_ma7`
- `include=all` returns every national series. Additive fields: `coverage`, `vintage`, `n_quotes`. Monthly rows add illustrative `cpi_contribution_pp`.

`GET /v1/health` reports snapshot time, coverage, imputed share, and the last job. Empty warehouse: `ok: false`.

`GET /v1/bulletin?frequency=monthly&format=json|csv` is the official extract. CSV comment lines start with `#`.

`POST /v1/collect/run`, `POST /v1/ingest/*`, and `POST /v1/index/rebuild` return `202 { job_id }`. A running `npm run collect:worker` process is required. Pricing uses database-managed transport/caps; Tinyfish is default, HTTP/offline require explicit selection. `GET /v1/jobs` needs an authorized operator session or `x-api-key`.

`GET /v1/backtest/dgca` adds `mape`, `rmse`, `n`, `points`, and `pass`.

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
- `trip_type` (optional, default `one_way`): `one_way` | `round_trip`
- `dep_date` (optional): Departure date in `YYYY-MM-DD` format.
- `cabin` (optional): `ECONOMY` | `PREMIUM_ECONOMY` | `BUSINESS`; omitted means all cabins.
- `limit` (optional, default `50`): Number of observations, bounded to 1–200.

Search reads the warehouse only and returns `fetched: false`. Empty results do not trigger HTTP collection.

**Example Response:**
```json
{
  "origin": "DEL",
  "destination": "BOM",
  "cheapest": 4500,
  "quote_count": 2,
  "fetched": false,
  "trip_type": "one_way",
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
- `trip_type` (optional): `one_way` | `round_trip`; omitted includes both.

History aggregates all cabins and departure dates for the selected route/trip. Search's departure and cabin filters apply only to its fare table.

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
Returns route index values by date when no lead time is selected. With a lead time, returns minimum non-outlier observed fares by route and collection date.

**Query Parameters:**
- `lead_time` (optional): Advance-purchase days, e.g. `1`, `7`, `15`, `21`, `30`, or `45`.

#### `GET /v1/elasticity`
Returns pricing curves and mean fare by advance purchase lead-time bucket.

---

### 4. Admin, Scraping & Ingestion

#### `GET /v1/health/collection`
Admin cookie required. Returns slot coverage, quality, blocked sources, job progress, and per-source results.

**Example Response:**
```json
{
  "last_snapshot_at": "2026-10-05T00:30:00.000Z",
  "snapshot_slot": "0600",
  "coverage": 0.7,
  "cell_coverage": 0.7,
  "imputed_share": 0.3,
  "quality": "partial",
  "vintage": "final",
  "blocked_sources": [],
  "progress": { "done": 80, "missing": 4 },
  "job": { "id": "UUID", "status": "ok" },
  "sources": []
}
```

#### `POST /v1/collect/run`
Admin cookie or ingest API key required. Returns **202 `{ "job_id": "UUID", "existing": false, "transport_mode": "tinyfish" }`** after durably enqueueing a full-basket adhoc snapshot. Repeated submissions return the existing active collection (`existing: true`), not another paid run. Optional `{ "origin": "CCU", "dest": "BOM" }` adds a pair without removing basket routes. `transportMode` accepts `tinyfish`, `http`, or `offline`; omission uses saved defaults. `scrape=false` explicitly selects offline. Settings are snapshotted into the queued payload. `{ "demo": true, "transportMode": "offline" }` includes enabled synthetic demo data. A contributor with the same database executes jobs; Tinyfish credentials belong on that worker.

#### `GET /v1/collect/monitor?job=UUID`
Google operator session required; machine ingestion keys do not grant access. Returns `server_time`, `settings`, `schedules`, `workers`, `jobs`, selected `job`, `events`, `counts`, `total`, `completed`, `quotes`, per-source totals, `budget`, and `adapters`. Defaults to the running job, then a queued job, then the latest run. Worker presence is online only with a heartbeat in the last 30 seconds. Key readiness is reported by the worker, not inferred from Vercel environment variables.

This endpoint reads the durable ledger only: no provider requests, robots checks, rebuild, or response cache. `completed` includes missing/blocked/error cells and does not mean fares were found. `quotes` counts accepted non-synthetic saved fare rows. UI polls every 2 seconds while a job is queued/running, otherwise every 15 seconds; hidden/offline tabs pause and background reads preserve content.

#### `GET /v1/collect/control` / `POST /v1/collect/control`
Google operator session required, including mutations. GET returns `{ settings, schedules }`. POST accepts:

| Action | Fields | Behavior |
|---|---|---|
| `settings` | `transport_mode`, `max_sessions`, `max_agent_runs`, `max_hours` | Save defaults. Integer caps 0–5; Tinyfish needs at least one Browser session; runtime 0.05–3h. |
| `schedule` | `run_at` (ISO timestamp with offset), optional `transport_mode`, `recurrence` (`once`/`daily`) | Persist future start, return 202. UI converts IST explicitly. Mode is saved on schedule; caps are snapshotted when queued. |
| `cancel_schedule` | `schedule_id` | Cancel future occurrences. Does not stop an already queued/running job. |
| `cancel` | `job_id` | Queued jobs become cancelled immediately; running jobs request cooperative stop and cleanup. |
| `retry` | `job_id` | Failed/cancelled runs only; queue fresh current snapshot with original settings/routes. Repeated retry requests deduplicate. |

No pricing schedule is seeded. Due jobs are queued by the contributor or `collect:daily`; concurrent triggers are serialized. A busy collection delays another scheduled start. Missed past-date one-time schedules expire; missed daily dates advance to a future occurrence instead of fabricating historical fares. Legacy `SNAPSHOT_HOURS` no longer queues pricing work; recreate required slots in admin.

#### `GET /v1/collect/sources`
Admin cookie. Adapter registry with configured enabled state, database transport gate, priority, host, and persisted slot blocks. This endpoint never contacts airline hosts. An eligible live adapter reports `robots.verdict: "pending"`; the worker checks robots.txt before collecting fares and fails closed on denial/error. `runnable` describes configuration eligibility, not a successful robots audit or provider readiness. Opening or refreshing the control page does not initiate collection or repeat robots checks.

#### `POST /v1/collect/sources`
Admin cookie. Body `{ "id": "file_drop", "enabled": true }` persists the adapter control. Policy-skipped hosts cannot be enabled.

#### `POST /v1/collect/discover`
Admin. Enqueues a weekly-style local schedule discovery job and returns **202 `{job_id}`**.
Reads `data/drops/schedule.csv`; Browser discovery stays off unless explicitly enabled.
Catalog routes never change national basket weights automatically.

Collection health additionally exposes `sessions_opened`, `sessions_deleted`, `session_attempts`,
`agent_runs`, caps, Tinyfish disable reason, and per-airline HTTP/browser/agent/skipped path.
Pricing starts are managed through `/v1/collect/control` or `/admin/scrape`.

#### `POST /v1/ingest/dump`
Authorized operator session or ingest API key. Body `{ "text": "...", "rebuild_index": true }`, or `{ "quotes": [...], "rebuild_index": true }`. Accepts JSON, CSV, or prose; prose needs `GEMINI_API_KEY` on the worker. Limit: 500,000 text characters or 2,000 quote objects. The complete input is persisted before returning `202 { "job_id": "UUID" }`.

#### `GET /v1/ingest/needed`
Admin cookie. Basket × ECONOMY/one_way × T+1/7/15/21/30/45 × configured snapshot slots (0600 by default) gaps (empty or older than seven days), plus copy-paste CSV lines. Synthetic/imputed snapshots do not satisfy an observed gap.

#### `POST /v1/ingest/quotes`
Queues 1–2,000 raw quote objects for ingestion. Requires an authorized operator session or ingest API key; returns `202 { "job_id": "UUID" }`.

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
Uploads a multipart CSV quote file (`file` field), up to 2 MB. Requires an authorized operator session or ingest API key; returns `202 { "job_id": "UUID" }`. Larger files return **413**.
- Query parameter: `rebuild_index=true|false` (default `true`).

#### `GET /v1/ingest/template`
Returns standard CSV template header and sample row with `Content-Type: text/csv`.

#### `POST /v1/index/rebuild`
Queues index reconstruction from cleaned observations. Requires an authorized operator session or ingest API key; returns `202 { "job_id": "UUID" }`.

#### `GET /v1/jobs` / `GET /v1/jobs/{id}`
Requires an authorized operator session or ingest API key. The list returns the 20 most recent jobs. Individual jobs return `id`, `type`, `status`, `stats`, `error`, and creation/start/finish timestamps; an unknown ID returns **404**.

Lifecycle: `queued` → `running` → `ok`, `error`, or `cancelled`. Submission success means persisted, not completed. The worker claims jobs atomically under a global owner lease, heartbeats every 5 seconds, and recovers stale jobs after five minutes. A worker is required even for manual ingestion/rebuilds. Detailed job responses include progress, cancellation, worker ownership, and heartbeat fields. Failed jobs stay visible; clients never automatically resubmit mutations after network failures.

#### `GET /v1/backtest/dgca`
Compares computed APIx against the DGCA TMU published 72-route benchmark (`data/dgca_benchmark.csv`).

---

### 5. Auth

#### `/api/auth/[...path]`
The Neon Auth SDK proxy handles Google OAuth, email sign-up/sign-in, email verification, session retrieval, and sign-out. Public UI recommends Google; email/password is secondary and uses Neon-managed credentials only.

The `/login` UI starts Google sign-in with a same-origin `/auth/callback?next=...`, uses an explicit redirect stage, and bounds stalled requests. `/auth/callback` verifies the challenge-bound login with Neon, preserves Neon-issued cookies, and records signed Google-session evidence bound to the managed user/session. Protected local return paths and query strings are preserved; external and recursive auth destinations are rejected. `/register` redirects to the account-creation stage on `/login`.

Google authorization URLs force `prompt=select_account`, remove account hints, and preserve OAuth state/PKCE/callback parameters. Only HTTPS `accounts.google.com` destinations are accepted. `authClient.signIn.email(...)` and `authClient.signUp.email(...)` provide public email/password access. Successful `POST /api/auth/sign-out` revokes the Neon session and clears local token/session-data/challenge cookies and Google/legacy proofs. The shell calls this endpoint directly to keep the sign-in SDK out of its bundle, then opens `/login?choose=1`. This does not log out of Google globally. Providers and trusted origins must be configured in Neon Console.

Failed/cancelled OAuth returns to staged login with the intended destination. Missing auth configuration produces **503 `AUTH_NOT_CONFIGURED`** on auth APIs; unexpected route failures produce **500 `AUTH_INTERNAL_ERROR`** and server diagnostics. Callback failures redirect to recoverable login instead of displaying raw JSON. See [deployment troubleshooting](../Deploy.md#troubleshooting-google-sign-in-failures).

All admin-only endpoints require a live Neon session, completed Google OAuth evidence, a verified email, and exact case-insensitive membership in `ADMIN_EMAILS`. Allowlisted password users and upstream admin roles cannot bypass this policy. "Admin cookie" in the endpoint descriptions means this authorized Neon Google session, not legacy `opus_admin`. Documented `INGEST_API_KEY` machine-ingestion access remains available where specified.

#### `GET /v1/auth/me`
`{ authenticated, user?: { id, email, role, provider, emailVerified, name, image } }`. Role is computed server-side; provider is `google` only with valid Google-session evidence, otherwise `other`. Reads bypass Neon's session-data cache.

#### `GET /v1/admin/check`
`{ authenticated, isAdmin, email?, name?, detail? }`. Uses the same policy as protected admin endpoints; no email-only or legacy role fallback.

#### `POST /v1/auth/logout` / `POST /v1/admin/logout`
Compatibility endpoints forward to Neon sign-out and clear Google/legacy cookies.

#### Legacy `POST /v1/auth/login`, `/v1/auth/register`, `/v1/admin/login`
Return **410**; use the Neon SDK proxy. Legacy local password rows and `opus_session`/`opus_admin` cookies no longer authenticate.
