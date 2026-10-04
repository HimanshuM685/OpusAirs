# OpusAirs collection engine

## What full coverage means

The collection universe is the union of every configured row in `data/psd_basket.csv`
and `basket_routes`, with six lead-time bins: **T+1, T+7, T+15, T+21, T+30, T+45**.
Each scheduled snapshot runs at **06:00 or 18:00 IST**; operators can enqueue an
additional `adhoc` snapshot. Departure dates use the IST calendar, including across
month/year boundaries.

A cell is `(origin, destination, lead_time_bin, ECONOMY, one_way, snapshot_at)`.
Each cell receives one representative fare, or an explicitly flagged gap/imputation.
This is basket coverage, not every commercial flight number in India. International
routes, seat inventory, seat maps, logged-in corporate fares, and disallowed OTA
search URLs are outside the collection scope. The current basket CSV labels its
weights illustrative/pending official PSD replacement; the engine uses the configured
rows without claiming they are certified official weights.

```text
IST scheduler / admin POST
  → pipeline_jobs (type=collect, durable payload, HTTP response 202 {job_id})
  → collection worker
  → collect_jobs (basket × bins × enabled adapters × snapshot)
  → manual | file_drop | synthetic_demo | robots-allowed HTML adapters
  → collection_runs + collect_attempts + quotes_raw
  → cleanQuotes (deduplication, components, MAD outlier flags)
  → quote_snapshots (source priority, economy one-way, explicit imputation)
  → compileIndex → index_values / index_revisions
```

`GET /v1/search` reads the warehouse only. It does not trigger a scrape. A full
collection request never overrides the environment's live HTTP gate.

## HTTP and robots policy

**`SCRAPE_ENABLED=false` is the default.** Both adapter selection and the HTTP
transport enforce it, including robots checks. With the flag off, no collector
HTTP request occurs; manual ingestion, operator file drops, and explicitly enabled
demo data still work.

Before each fare request, check the host's robots policy for the exact path and
query. Robots files are fetched through the same polite transport, cached for up
to five minutes, and refreshed for a new collection run. Parsing supports grouped
user agents, the most specific bot group, wildcard paths, end anchors, longest
rules, percent-encoded unreserved characters, and Allow precedence on ties.

* Disallow: `blocked_robots`, notes `robots_disallow`; **zero requests to the fare path**.
* Robots unavailable, non-2xx, redirect, or challenge HTML: `blocked_robots`,
  `robots_fetch_error`; fail closed.
* Challenge HTML or 401/403: `blocked`, with `challenge_page` / `http_403` notes.
  Close that host for the slot and continue the other hosts. Remaining worklist
  cells are logged as blocked without further requests. A resumed slot retains
  its closed-host state.
* Network failures, 429, and 5xx: initial request plus at most two retries, with
  exponential backoff and `Retry-After` honored. Exhaustion produces `error`.
* Redirects are not followed automatically into an unaudited path or host.

Configure a real bot identity:

```dotenv
SCRAPE_ENABLED=false
BOT_DOMAIN=your-domain.example
BOT_CONTACT=contact@your-domain.example
COLLECT_MAX_RPM_PER_HOST=8
COLLECT_JITTER_MS=3000-8000
COLLECT_MAX_CONCURRENT_HOSTS=3
SNAPSHOT_HOURS=6,18
```

Every request uses
`User-Agent: OpusAirs-APIx-Bot/1.0 (+https://<BOT_DOMAIN>/bot; <BOT_CONTACT>)`.
The transport serializes each host, randomizes the 3–8-second delay, additionally
enforces the RPM ceiling (8 RPM implies at least 7.5 seconds between starts), and
respects a stricter published Crawl-delay. A semaphore bounds concurrent hosts.
Cells are shuffled before their work order is persisted.

**Anti-bot circumvention is out of scope and prohibited.** No CAPTCHA solving,
Cloudflare/Turnstile bypass, residential proxy rotation for evasion, TLS/JA3 spoofing,
cookie/session theft, login stuffing, or headless stealth plugins. Robots permission
is necessary, not permission to violate a site's terms. Enable HTML adapters only
for uses the source permits. Prefer official fare APIs, published CSVs, partner
feeds, and lawful operator ingestion.

## Sources and priorities

| Adapter | Rank | Policy |
|---|---:|---|
| `manual` | 40 | Reads existing operator CSV/JSON observations; no HTTP |
| `file_drop` | 40 | Reads `data/drops/*.csv`; no HTTP |
| `synthetic_demo` | 100 | Deterministic, source=`synthetic`; explicit demo flag only |
| `indigo` | 10 | Policy-only skipped entry; no HTML collector or HTTP |
| `airindia` | 12 | Existing HTML adapter; opt-in and runtime robots check |
| `airindia_express` | 14 | Existing HTML adapter; opt-in and runtime robots check |
| `akasa` | 16 | Existing HTML adapter; opt-in and runtime robots check |
| `spicejet` | 18 | Existing HTML adapter; opt-in and runtime robots check |

IndiGo, MakeMyTrip, Ixigo, Goibibo, and Yatra search hosts are excluded by policy.
MakeMyTrip, Ixigo, Goibibo, and Yatra have no HTML adapters. No current live audit
is claimed for the other hosts: their verdict is checked at runtime. New HTML
adapter seeds are disabled. Existing stored enable/disable choices are preserved,
but `SCRAPE_ENABLED` and policy skips remain mandatory gates. An empty enabled
selection stays empty; it never falls back to every portal.

`SourceAdapter` is defined in `lib/collect/types.ts` and registered in
`lib/collect/sources/index.ts`. Lowest `source_rank` wins among eligible non-outlier
quotes for the same cell; fare breaks rank ties. Carrier records can include
6E, AI, IX, QP, SG when quoted by an allowed source. Other cabins can be stored in
raw/clean tables but **BUSINESS and round-trip fares never enter national APIx**.

No API claiming to provide flight schedules is treated as a fare API. Partner/API
adapters can implement the same interface when a permitted fare feed and its key
are available; the shipped engine does not invent inventory or fares from a
schedule-only service.

## Complete gaps legally

Use `/admin/ingest`, `POST /v1/ingest/quotes`, `POST /v1/ingest/csv`, or
`POST /v1/ingest/dump`. Standard CSV columns:

```csv
source,origin,destination,carrier,flight_no,dep_date,return_date,trip_type,lead_time_days,collected_on,base_fare,taxes,udf,convenience,total_fare,status
manual,DEL,BOM,6E,6E201,2026-10-12,,one_way,7,2026-10-05,,,,,4850,ok
```

Drop equivalent CSV files in `data/drops/` before a slot to use `file_drop`.
Observation date must match the collection day and departure date the target cell.
Optional `fare_class` defaults to ECONOMY; `collected_at` / `observation_time` can
provide the actual ISO observation timestamp. File drops default to file mtime,
not the time they are reread. Morning operator observations do not become new
evening observations merely by being read again; carrying them forward is flagged.

`GET /v1/ingest/needed` (admin) lists basket × all six bins × both scheduled slots
that are empty or whose last non-imputed observation is older than seven days.
Each entry contains `snapshot_slot`, a hint, and a CSV stub `dump_line`. Replace
`<total_fare>` with a lawful observation before submitting it.

Imputation order: an adjacent observed lead bin on the route, a prior snapshot
within seven days, then the median of current real observations. These rows have
`is_imputed=1` and `impute_method`. Outlier-only selections are also flagged.
With **no real reference at all**, write a nullable-price row with
`impute_method=unavailable`, rather than fabricate an official observation.
The slot remains structurally complete and low quality; index publication needs
at least one usable reference price. Use explicitly tagged demo data for empty
warehouse judging.

## Observed coverage and quality

For a good slot, target **≥0.80 observed route coverage**:

```text
coverage = Σ route_weight × 1[all six route cells observed, not imputed] / Σ route_weight
```

A partially observed route does not count as fully covered. `cell_coverage`
separately reports the passenger-weighted fraction of observed lead-bin cells;
`imputed_share = 1 - cell_coverage`. Neither synthetic nor imputed cells count
as observations. Below **0.60**, vintage is `provisional`, quality `low`.
Between 0.60 and 0.80, quality is `partial`; ≥0.80 is `good`.

Each attempt is persisted in `collect_attempts`; HTTP attempts and per-cell outcomes
also appear in `collection_runs`. Every cell outcome writes `quotes_raw`, including
missing, sold_out, blocked, blocked_robots, and error; existing observed manual
rows retain their provenance. Existing `quotes_raw` unique key is retained.
Slot-specific `collect_jobs` and immutable earlier snapshot rows distinguish the
two daily runs. Raw rows retain status, rank, notes, observation time, and snapshot.

`GET /v1/health/collection` (admin) returns last snapshot, route/cell coverage,
imputed share, vintage, quality, unavailable cells, blocked sources, latest job,
progress, and aggregated `sources`. `/admin/scrape` displays these plus persistent
adapter controls and live robots verdicts. `GET/POST /v1/collect/sources` require
an admin cookie; a policy-skipped source cannot be enabled.

## Worker, scheduler, recovery, and demo

Run the web app and worker as separate processes:

```bash
npm run dev
npm run collect:worker
```

The worker polls every 30 seconds, schedules due 06:00/18:00 IST snapshots, and
drains durable `pipeline_jobs`. The scheduled snapshot timestamp is its unique
dedupe key, so repeated scheduler ticks do not repeat a slot. Each host has one
worker; independent hosts can continue when another blocks. Jobs and the global
collection lock use heartbeat leases; stale jobs are recoverable after five
minutes. Per-cell rows already finished are not refetched when a slot resumes.
`COLLECT_MAX_HOURS` bounds a run (default 18); any budget/time-limited remainder
stays queued for continuation by the next worker pass.
If a queued slot crosses into another IST date, its recovery does not fetch live
fares and falsely label them observations of yesterday; it uses existing operator
records and flagged imputation instead.

`npm run collect:daily` only enqueues due slots. It does not run a scraper inside
the scheduler process. For an external UTC cron, schedule at `30 0,12 * * *`.
`npm run collect:worker -- --once` schedules and drains once. Docker Compose
includes a separate `collection-worker` service and a read-only operator drops
mount.

Offline judging:

```dotenv
SCRAPE_ENABLED=false
SYNTHETIC_DEMO_ENABLED=true
```

Enable `synthetic_demo` in admin source controls, select **Demo snapshot**, then
**Run snapshot now**. Its quotes are deterministic and tagged `source=synthetic`.
Only an explicit `demo:true` job can include them in snapshots/index compilation;
their vintage is **demo**, never final, and observed coverage stays zero. Ordinary
official rebuilds exclude synthetic snapshots. Manual and file-drop quotes retain
their real-observation provenance and priority over synthetic quotes.
