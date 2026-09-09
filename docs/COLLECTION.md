# Airfare Collection Policy & Scraper Architecture

OpusAirs employs a dual-channel collection pipeline to populate raw airfare quotes (`quotes_raw`) in the PostgreSQL / Neon warehouse:
1. **Automated Live Web Scraper** (controlled, ethical, and rate-limited HTTP extraction)
2. **Manual Data Dump Area** (CSV uploads, JSON dumps, and operator copy-paste via Admin UI)

---

## 1. Automated Portal Scraping

The scraper runs when triggered via the Admin Panel (`/admin/scrape`) or through `POST /v1/collect/run?scrape=true`.

### Ethical Collection Rules
- **Robots.txt Adherence**: Before scraping any portal origin or search endpoint, the collector fetches and evaluates `/robots.txt`. If the path is disallowed for the designated `USER_AGENT` or `*`, the request is skipped and marked as `blocked` with reason `robots.txt`.
- **Identifiable User-Agent**: Every request sends the configured `USER_AGENT` (default: `OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in)`).
- **Politeness Rate-Limiting**: Every query enforces a sleep delay governed by `LIVE_RATE_LIMIT_SECONDS` (default: `8` seconds) to avoid stressing origin airline servers.
- **Search Budget Caps**: Execution is capped by `max_searches_per_run` (defined in `data/scrape_sources.json`) to prevent uncontrolled looping.
- **No CAPTCHA Bypass or Proxy Abuse**: The scraper explicitly **does not** employ CAPTCHA solvers, proxy rotators, or headless browser obfuscation. If an anti-bot challenge (Cloudflare, reCAPTCHA, 403, 429) is encountered, the event is recorded with `status=blocked` and logged in `collection_runs`. Operators can then provide quotes via the Data Dump Area.

---

## 2. Manual Data Dump Area

To ensure resilience against aggressive anti-scraping walls, operators can dump manual fare observations directly into the system:

- **Admin Web Interface (`/admin/ingest`)**:
  - **CSV File Upload**: Drag-and-drop CSV files conforming to the schema.
  - **JSON Paste**: Paste structured JSON arrays extracted from OTAs or booking engines.
  - **Sample Template**: Downloadable directly from the UI or via `GET /v1/ingest/template`.
- **Batch CSV Auto-Ingest**: Dropping a `quotes_manual.csv` in `data/` will automatically be ingested on application startup.
- **Auto-Rebuild**: When `rebuild_index` is true, the cleaner immediately filters outliers, splits fare components, and updates the consumer-facing indices and search prices.

---

## 3. Health Monitoring & Auditability

Every collection run creates a record in `collection_runs`:
- `started_at` & `finished_at`: Execution timing
- `source`: Airline or OTA identifier
- `status`: `ok`, `running`, or `failed`
- `quotes_ok`: Valid fares captured
- `quotes_missing`: Route/date returned no available flights
- `quotes_sold_out`: Flights were full or sold out
- `quotes_blocked`: Challenge detected or robots.txt disallowed
- `notes`: Error context or summary

Collection health is visible in real-time on the Admin Overview (`/admin`) and Scrape Monitor (`/admin/scrape`), or via `GET /v1/health/collection`.
