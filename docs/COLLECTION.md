# Daily flight pricing collection (v1)

OpusAirs extends its existing Next.js + Neon warehouse:
`quotes_raw → cleanQuotes → quote_snapshots → index_values`. Tinyfish is an optional
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

* **`SCRAPE_ENABLED=false` and `TINYFISH_ENABLED=false` by default.** File/JSON ingest
  and `PoliteHttp` remain the cheap/default path. Tinyfish requires both flags, a key,
  and `TINYFISH_COUNTRY=IN`.
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
2. Robots gate, then one `PoliteHttp` HTML probe. A parser hit drains the list through
   HTTP under jitter; it opens **zero Tinyfish sessions**. A sold-out/missing response
   is not a reason to purchase Browser calls. Only a JS-shell parser miss qualifies.
3. If enabled and budget permits, open **one Browser session for that airline**.
   Reuse `browser.contexts()[0].pages()[0]` for every route/bin. Never create a page,
   session, or Agent per cell. Checkpoint each parsed quote immediately.
4. After Browser deletion, at most **one async Agent run** can process all remaining
   pairs, only if every Browser visit was a parser failure and there were zero
   parseable quotes. Partial success, sold-out results, navigation errors, challenges,
   or an HTTP parser hit never escalate to Agent.
5. Operator CSV/file drops cover leftovers; mark the rest missing and impute.

Default ceilings per run: **5 Browser sessions, 5 Agent attempts** (one each per airline).
Smaller env caps are supported; reservations persist in `collect_budget` and survive
crashes. Failed/ambiguous creates consume a reservation rather than permitting a
possibly duplicate paid session. `sessions_opened` counts confirmed sessions,
`sessions_deleted` confirmed 204 deletes, and `session_attempts` exposes reservations.
The same state is attached to job stats and read live by collection health.

Cost model: ≤5 × 900s = **75 Browser session-minutes/slot**, and ≤5 × 600s =
**50 Agent-minutes/slot** at maximum duration. Browser creation typically takes
10–30s each (50–150s across five airlines). Session time is billed for the whole
session; exact dollars require your account's Browser/Agent rates. HTTP success
costs zero Tinyfish calls. Default one daily slot halves the two-slot budget.

### Browser API

Worker POSTs `https://api.browser.tinyfish.ai` with `X-API-Key`, a ≥60s request
timeout, `timeout_seconds=900`, and `{type:"tinyfish",country_code:"IN",enabled:true}`.
Sessions start blank: Tinyfish startup navigation otherwise precedes CDP bot-UA and
robots guards. After attaching those guards, `playwright-core` Chromium connects to
`cdp_url`; the existing page navigates each allowed search URL with `domcontentloaded`.
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

## Worker, scheduling, health, and demo

```dotenv
SCRAPE_ENABLED=false
TINYFISH_ENABLED=false
TINYFISH_API_KEY=
TINYFISH_COUNTRY=IN
TINYFISH_MAX_SESSIONS_PER_RUN=5
TINYFISH_MAX_AGENT_RUNS_PER_RUN=5
TINYFISH_SESSION_TIMEOUT_S=900
SNAPSHOT_HOURS=6
COLLECT_MAX_HOURS=3
DISCOVER_WITH_BROWSER=false
```

```bash
npm run dev
npm run collect:worker
# External UTC cron for the price scheduler: 30 0 * * * npm run collect:daily
# Weekly discovery: 30 20 * * 6 npm run collect:daily (Sunday 02:00 IST)
```

`collect:daily` enqueues due jobs; worker polls every 30s and also schedules them.
Slot dedupe and the existing collect lock make a second scheduled trigger no-op.
Jobs/lock heartbeat leases recover after five minutes. Known session/Agent IDs are
cleaned up before resumption, while paid reservations prevent duplicate runs.
`COLLECT_MAX_HOURS` defaults to 3; deadline and SIGTERM/SIGINT abort remote work and
run cleanup before final snapshot/index rebuild. An older IST-day job never fetches
live fares and mislabels them yesterday's observations. 18:00 is off unless explicitly
configured with `SNAPSHOT_HOURS=6,18`.

`GET /v1/health/collection` and `/admin/scrape` expose HTTP/browser/agent/skipped path,
session ID/deletion status, quotes parsed, blocked reason, session and Agent counts/caps,
coverage, job progress, and robots results. No credentials/CDP URL are exposed.
Alert webhook fires for observed coverage <0.80 or any blocked airline, never buys
another session. Coverage is the passenger-weighted share of **non-imputed basket
lead-bin cells**; below 0.60 stays provisional/low quality.

Use `/admin/ingest`, CSV/JSON endpoints, or `data/drops/*.csv` to complete gaps legally.
`GET /v1/ingest/needed` supplies stale/empty cells and CSV stubs. Optional
`collected_at` preserves observation timestamp. Rereading a morning operator file
does not turn it into an evening observation.

For offline judging keep both live flags false, set `SYNTHETIC_DEMO_ENABLED=true`,
enable its adapter, and enqueue `{demo:true}`. Synthetic quotes remain tagged and
produce demo vintage/zero observed coverage; normal rebuilds exclude them.

## Verification

`npm test` uses mocked HTTP/CDP/provider responses. It verifies robots deny → no
session, HTTP success → no Tinyfish, one session/page for all cells, no Agent after
parser hit, delete-on-throw, budget disable, async cancellation, worklist order/DOW,
economy isolation, catalog weight isolation, and demo provenance. No paid API calls.

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
also verifies persisted budget reservations, catalog-only relatives, other-cabin
isolation, and a mocked provider 402 followed by a successful index rebuild.
