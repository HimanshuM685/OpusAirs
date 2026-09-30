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

Collection health is visible in real-time on the Admin Overview (`/admin`) and Scrape Monitor (`/admin/scrape`), or via `GET /v1/health/collection`. Today's queue counts are `GET /v1/collect/jobs` (admin cookie).

---

## 4. Daily cron and recovery

The crawl is a resumable job queue (`collect_jobs`), not one HTTP page per click. PSD basket routes are priority 0. A collector that returns a real Indian city pair inserts it into `collect_routes` for the next day. Search paths that `robots.txt` disallows are marked `blocked` and are not fetched.

```bash
mkdir -p data/logs
# 02:15 local time. Stops after COLLECT_MAX_HOURS (default 18) and resumes next run.
15 2 * * * cd /path/to/OpusAirs && npm run collect:daily >> data/logs/collect.log 2>&1
```

`npm run collect:daily` runs `scripts/collect-daily.ts`, which calls `runPipeline({ scrape: true, full: true })`.

- A second start exits 0 while a lock younger than `COLLECT_MAX_HOURS` is `running`.
- Jobs left `running` with `locked_at` older than 15 minutes return to `pending` (or `failed` after 3 attempts). `quotes_raw` is not deleted.
- Timeout and HTTP 5xx retry up to 3 times. `robots.txt`, 401, 403, 429, and challenge pages are `blocked` for that day and are not retried.
- The script exits 1 only if the process throws or the queue had pending jobs and none were attempted. A high block rate logs coverage and, when `ALERT_WEBHOOK` is set, POSTs `{ "text": "..." }`. It still exits 0 if the queue drained.
- Re-run the same command after a crash. Completed jobs for that `collected_on` are not repeated.

Horizon per route, per enabled source: T+1, T+7, T+14, T+21, T+30, one-way and round-trip (return = departure + 7 days). `LIVE_RATE_LIMIT_SECONDS` (default 8) applies between fetches to the same host, not between robots.txt skips.
