# Daily flight pricing collection (v1)

OpusAirs extends its existing Next.js + Neon warehouse:
`quotes_raw → cleanQuotes → quote_snapshots → index_values`. Tinyfish is the default
worker transport, not a second scraper stack. Public search stays warehouse-only;
there is no `/v1/tinyfish` endpoint and no CDP connection inside an HTTP request.

## Coverage and routes

A cell is `(origin, destination, lead_time_bin, ECONOMY, one_way, snapshot_day)`.
The lead bins are **1, 7, 15, 21, 30, 45** days. Departure dates use the IST calendar.
Every configured basket pair from `basket_routes` and `data/psd_basket.csv` is required,
even without a published schedule. The configured CSV currently labels some weights
illustrative/pending official PSD replacement; collection does not certify those weights.

Additional domestic nonstop pairs come from `route_catalog`. Published schedule
rows specify `dow_mask` (Mon=1 … Sun=64). Only catalog cells with service on their
**departure** weekday enter the pricing worklist. Basket cells are never removed
by a schedule gap. Catalog-only pairs receive `apix_route` relatives but cannot
enter national Laspeyres/Jevons/T+21 sums or influence basket-median imputation.
Promote a route by an explicit basket/weight edit, not automatic discovery.

Order: basket first, passenger weight descending, then **T+21, T+7, T+1, T+15,
T+30, T+45**. Catalog-only pairs follow. Existing valid observations for the same
travel date younger than 36 hours avoid another network visit. Schedule discovery
is weekly, never a daily Browser expense.

Complete coverage means each worklist cell has an observation or flagged imputation,
not every commercial flight/seat map in India. Empty allowed sources do not justify
more sessions. Imputation remains adjacent lead, carry-forward ≤7 days, then basket
median. With no usable reference, retain a nullable-price row with
`is_imputed=1, impute_method=unavailable`; do not invent an official price.

## Hard transport rules

* Pricing mode is saved in **`collection_settings` via `/admin/scrape`**: Tinyfish
  (default), HTTP only, or offline. Missing provider credentials/capability never
  silently switch transport. Tinyfish requires the contributor's private key and
  `TINYFISH_COUNTRY=IN`. Legacy enable flags apply only outside the pricing runtime,
  such as opt-in Browser route discovery. Select offline to disable live pricing.
* Before a fare request, Browser create, or Agent run, evaluate `robotsVerdict` for
  the exact host/path. Deny or robots fetch error writes **blocked_robots**, with
  **zero Browser creates and zero Agent runs**. Tinyfish never receives a disallowed host.
* Identify as `OpusAirs-APIx-Bot/1.0 (+https://<BOT_DOMAIN>/bot; <BOT_CONTACT>)`.
* Browser/Agent requests specify `proxy_config.country_code="IN"`; one sticky exit
  is for Indian fare locality, not evading restrictions. No country fallback.
* A challenge, 401/403, or browser 429 closes that airline/host for the day. Delete
  the session, continue other airlines, ingest/impute gaps. Never buy another session
  to retry a block.
* No CAPTCHA solving, Cloudflare/Turnstile bypass, stealth plugins, TLS/JA3 spoofing,
  login stuffing, credential theft, airline password storage, or Vault use. No saved
  Browser Context Profiles. Public fares only. Robots allowance is necessary; an
  operator must also have permission under the site's terms before enabling a source.
* National APIx uses **ECONOMY + one_way only**. Other cabins can be stored but cannot
  move national `apix_*` series.

Robots parsing covers specific/grouped user agents, wildcard/query paths, end anchors,
longest-match rules, Allow ties, and unreserved percent encoding. Fetch errors and
challenge/redirect HTML fail closed. Cache expires after five minutes and resets per
collection run. Browser requests are guarded before dispatch, including same-host
resources; off-host requests are blocked rather than silently following an unaudited
booking flow. The parser can consequently return no fares on portals that require
another host; those gaps go to ingest/imputation.

`PoliteHttp` serializes a host, uses 3–8s randomized jitter, honors Crawl-delay and
the RPM ceiling (8 RPM implies ≥7.5s between starts), and exponentially backs off
on 429/5xx with at most two retries. Redirects are not blindly followed.

## Airline loop and cost budget

The worker handles **IndiGo, Air India, AI Express, Akasa, SpiceJet sequentially**.
No airline parallelism in v1. Offline sources run first; source controls are persistent.

1. Load schedule/worklist and lawful operator observations without network discovery.
2. Robots gate. Tinyfish mode goes directly to Browser, without an HTTP fare probe.
   Explicit HTTP mode processes through `PoliteHttp` and never buys Tinyfish calls.
   Offline mode reads local/operator observations without live airline requests.
3. In Tinyfish mode, budget permitting, open **one Browser session for that airline**.
   Reuse `browser.contexts()[0].pages()[0]` for every route/bin. Never create a page,
   session, or Agent per cell. Checkpoint each parsed quote immediately.
4. After Browser deletion, at most **one async Agent run** handles unresolved cells
   when hydrated pages still have parser misses. After two empty hydrated shells,
   stop probing identical shells and move to Agent. Otherwise finish the Browser
   pass first. Existing fares/sold-out cells are excluded from Agent input; failures,
   challenges, and unconfirmed cleanup do not authorize another paid attempt.
5. Operator CSV/file drops cover leftovers; mark the rest missing and impute.

Default ceilings per run: **5 Browser sessions, 5 Agent attempts** (one each per airline).
Smaller caps and runtime (up to 3 hours) are saved in admin; reservations persist in `collect_budget` and survive
crashes. Failed/ambiguous creates consume a reservation rather than permitting a
possibly duplicate paid session. `sessions_opened` counts confirmed sessions,
`sessions_deleted` confirmed 204 deletes, and `session_attempts` exposes reservations.
The same state is attached to job stats and read live by collection health.

Cost model: ≤5 × 900s = **75 Browser session-minutes/slot**, and ≤5 × 600s =
**50 Agent-minutes/slot** at maximum duration. Browser creation typically takes
10–30s each (50–150s across five airlines). Session time is billed for the whole
session; exact dollars require your account's Browser/Agent rates. HTTP success
costs zero Tinyfish calls. Total daily cost scales with schedules you create; no
pricing schedule is created by default.

### Browser API

Worker POSTs `https://api.browser.tinyfish.ai` with `X-API-Key`, a ≥60s request
timeout, `timeout_seconds=900`, and `{type:"tinyfish",country_code:"IN",enabled:true}`.
Sessions start blank: Tinyfish startup navigation otherwise precedes CDP bot-UA and
robots guards. After attaching those guards, `playwright-core` Chromium connects to
`cdp_url`; the existing page navigates each allowed search URL with `domcontentloaded`
and waits up to 8 seconds for network idle before reading hydrated HTML.
Between cells pause 2–4s. Existing `parse.ts` and carrier adapter parser process HTML.

Session lifetime is additionally capped at 900s wall time. Always DELETE
`https://api.browser.tinyfish.ai/{session_id}` in `finally`, including throws/shutdown.
204 confirms cleanup; retry once on 409/503/504 (also transient transport/429).
Unconfirmed deletion disables Tinyfish and remains visible for recovery. Recovery
deletes known open session IDs before spending new budget; CDP URLs/cookies are never
stored. Unknown sessions after an ambiguous provider create cannot be claimed deleted;
their inactivity timeout is the backstop.

Provider 401/402/429 disables Tinyfish for the rest of the run; 429 honors Retry-After
without issuing another create. Remaining airlines still clean/impute/rebuild. The
admin screen exposes the reason. Cleanup requests remain allowed even after disable.

### Agent exception path

Only `POST https://agent.tinyfish.ai/v1/automation/run-async` is used. One goal lists
all remaining city-pairs/departure dates, permitted URLs, economy one-way INR prices,
no login, and stop-on-block rules. Use the quote-array `output_schema`,
`agent_config.max_steps=40`, `max_duration_seconds=600`, and standard `lite` runtime.
No Research/Search API, `/run`, or `/run-sse`.

Poll `GET /v1/runs/{id}` until terminal or 12 minutes; timeout/shutdown/error cancels
through `POST /v1/runs/{id}/cancel`. Known unfinished Agent IDs are cancelled on
recovery. Partial results never start a second run. Returned JSON is untrusted:
`parseQuoteRows` reuses the HTML parser's flight/cabin/fare checks, matches each row
to a requested pair/date/carrier, and rejects invalid prices, BUSINESS, round trips,
and unrelated cells. Only parser-accepted rows reach official snapshots. Jobs using
Agent output carry `vintage_note=agent_provisional` even after accepted rows are stored.
Raw Agent rows without parser acceptance are excluded from national snapshots.

Tinyfish's published Agent contract currently omits `IN` from its proxy-country
enum and marks `max_steps` account-gated. This implementation keeps the requested
IN/40-step limits and records a provider rejection; it does not remove those limits
or change exit country. Browser bot identity is enforced over CDP; Agent goals
require bot identity and robots compliance and instruct the provider to stop if
it cannot satisfy them. Live account capability must support these constraints.

## Sources and rank

| Source | Rank | Use |
|---|---:|---|
| direct airline parser | 10–20 | Runtime robots-allowed HTML |
| `tinyfish:<airline>` | 25 | Browser HTML accepted by the same parser |
| `agent:<airline>` | 28 | Parser-validated Agent output |
| compliant OTA | 30 | Only if permission and runtime robots allow |
| `manual`, `file_drop` | 40 | Lawful operator observation |
| `synthetic` | 90 | Explicit demo, never official |

Lowest eligible rank wins, fare breaks rank ties. IndiGo's current search path is
a policy skip, not an HTML/Tinyfish collector. MakeMyTrip, Ixigo, Goibibo, Yatra have
no search collectors. Represent unavailable airline prices through allowed feeds
or operator files. Other existing carrier adapters stay opt-in and runtime-gated.

## Weekly route discovery

`pipeline_jobs.type=discover` is scheduled **Sunday 02:00 IST**, with weekly dedupe.
Manual `POST /v1/collect/discover` also enqueues it. Seed basket pairs with unknown
carrier `NA`/empty flight number; this seed is not evidence of a published schedule.
Read `data/drops/schedule.csv` and upsert the domestic catalog:

```csv
origin,destination,carrier,flight_no,dow_mask
DEL,BOM,AI,AI101,127
CCU,MAA,6E,6E201,5
```

No daily rediscovery. Schedule files are not fare CSVs and are excluded from
`file_drop` price parsing. An empty/absent file does not trigger Browser discovery.
Existing catalog rows are not silently promoted into national weights.

Browser discovery requires **DISCOVER_WITH_BROWSER=true**, both live flags, budget,
and explicit `DISCOVER_<AIRLINE>_PATH` for a permitted public timetable/map URL.
Reuse the same Browser transport and parser for published `data-origin`/
`data-destination` route attributes. One session per airline, five maximum, no Agent,
no OTA pagination. No index rebuild is needed for catalog changes alone.

## Laptop contributor, schedules, and live monitoring

```dotenv
# Configure locally on the contributor, using the same Neon DB as Vercel:
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
TINYFISH_API_KEY=
TINYFISH_COUNTRY=IN
TINYFISH_SESSION_TIMEOUT_S=900
DISCOVER_WITH_BROWSER=false
```

```bash
npm run collect:worker
npm run collect:worker -- --name "My Mac"
npm run collect:worker -- --json
npm run collect:worker -- --job <UUID>
# Optional scheduler-only invocation:
npm run collect:daily
```

Install dependencies on the laptop, keep Terminal open and laptop awake. Startup
reports DB connection, mode, and local Tinyfish readiness; logs show IST time, job,
source/transport phases, each cell outcome, saved counts, and cleanup. `--once`
drains due queued work once. No secret or CDP URL is displayed in admin or logs.

Use `/admin/scrape` to choose transport/caps, run now, or save a one-time/daily IST
start. Schedules survive browser closure and Vercel restarts. Contributor checks
every 5 seconds; it must be awake to execute them. Same-day starts can wait behind
active work; missed past-date one-time schedules expire and daily schedules advance
to their next future occurrence. No backdated live fares. No pricing schedule is
seeded: on upgrade, recreate desired old `SNAPSHOT_HOURS` slots in admin.

Run submissions and due schedules use transaction locks/dedupe. One global worker
lease owns execution and orphan cleanup. Jobs heartbeat every 5 seconds; stale
ownership becomes recoverable after five minutes. Known sessions/Agent IDs are
cleaned up before resumption; paid reservations survive crashes. Ctrl+C cooperatively
pauses the job for recovery. Operator cancellation becomes terminal after cleanup;
runtime expiry fails visibly with saved observations retained. Retry creates a
fresh current snapshot with saved settings, subject to the same caps.

Deploy matching web/worker revisions and stop/restart the old contributor during
upgrade. Idempotent bootstrap adds `collection_settings`, `collection_schedules`,
`collection_workers`, `collection_worker_lease`, `pipeline_job_events`, and job
progress/ownership/cancellation columns. Pricing ignores legacy `SCRAPE_ENABLED`,
`TINYFISH_ENABLED`, `COLLECT_MAX_HOURS`, and per-run cap env vars; database settings
are authoritative. Optional Browser discovery still uses its explicit legacy gates.

`GET /v1/collect/monitor` powers admin using a single uncached request: worker presence,
selected run, next schedule/countdown, phases, real fare/gap counts, source outcomes,
session/Agent cleanup, and durable events. Running work wins over newer queued jobs.
Presence is stale after 30 seconds. Polling is 2s active/15s idle, paused hidden/offline;
background refresh retains content and unsaved settings. Processed cells include
missing/blocked/error outcomes, not successful fare coverage. No fabricated ETA.
The legacy `GET /v1/health/collection` retains snapshot coverage/provenance summaries.
Alert webhook fires for observed coverage <0.80 or any blocked airline, never buys
another session. Coverage is the passenger-weighted share of **non-imputed basket
lead-bin cells**; below 0.60 stays provisional/low quality.

Use `/admin/ingest`, CSV/JSON endpoints, or `data/drops/*.csv` to complete gaps legally.
`GET /v1/ingest/needed` supplies stale/empty cells and CSV stubs. Optional
`collected_at` preserves observation timestamp. Rereading a morning operator file
does not turn it into an evening observation.

For offline judging select offline, set `SYNTHETIC_DEMO_ENABLED=true`,
enable its adapter, and enqueue `{demo:true,transportMode:"offline"}`. Synthetic quotes remain tagged and
produce demo vintage/zero observed coverage; normal rebuilds exclude them.

## Verification

`npm test` uses mocked HTTP/CDP/provider responses. It verifies robots deny → no
session, Tinyfish-first → no HTTP, explicit HTTP/offline isolation, hydrated-shell
probing, partial Browser success → only unresolved Agent cells, delete-on-throw,
budget disable, async cancellation, worklist order/DOW, schedule validation/IST,
economy isolation, catalog weights, and demo provenance. No paid API calls.

Optional PostgreSQL integration uses a disposable test container only:

```bash
docker run --detach --rm --name opusairs-collection-test --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=opusairs-test postgres:17-alpine
docker exec opusairs-collection-test pg_isready -U postgres
COLLECT_TEST_POSTGRES_CONTAINER=opusairs-collection-test npx tsx --test lib/collect/warehouse.test.ts
docker stop opusairs-collection-test
```

When Docker is unavailable, `COLLECT_TEST_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js`
runs the same integration against an in-memory PostgreSQL WASM engine. The test
also verifies atomic duplicate-click/schedule enqueue, expiry/daily recurrence,
worker lease takeover/presence, direct/queued run completion, persisted budget
reservations, catalog-only relatives, other-cabin isolation, and a mocked provider
402 followed by a successful index rebuild. `scripts/verify-experience.mjs` covers
desktop/mobile monitor rendering, stable polling DOM, unsaved settings, IST schedules,
cancel, stale/terminal states, and successful sign-out. Live Google/provider access
still requires validation against configured production accounts.
