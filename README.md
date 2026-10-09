# OpusAirs — Real-time Airfare Price Index (APIx)

> Smart India Hackathon 2026 — [SIH26056](https://sih2026.vuce.in/ps/SIH26056)  
> High-frequency airfare collection, Laspeyres/Jevons price index construction, and route analytics for MoSPI / NSO and RBI.

OpusAirs is a full-stack Next.js platform powered by serverless PostgreSQL (Neon). A public landing page leads into one staged sign-in flow: users access collected airfare comparisons and macroeconomic price indices, while authorized Google accounts also access collection, ingestion, and benchmark tools. Analytics pages and warehouse APIs require a live Neon session.

---

## 🏛 Architecture Overview

```
                          ┌───────────────────────────┐
                          │   OpusAirs Next.js App    │
                          │   (TypeScript / App Router│
                          └─────────────┬─────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
     ┌───────────────────────┐                     ┌───────────────────────┐
     │      User Side        │                     │ Admin / Operator Side │
     ├───────────────────────┤                     ├───────────────────────┤
     │ • Landing Page (/)    │                     │ • Overview (/admin)   │
     │ • APIx Dashboard      │                     │ • Scraper Engine      │
     │   (/dashboard)        │                     │   (/admin/scrape)     │
     │ • Flight Search       │                     │ • Data Dump Area      │
     │   & Gain (/search)    │                     │   (/admin/ingest)     │
     │ • Route Relatives     │                     │ • DGCA Backtesting    │
     │ • Heatmap & Elasticity│                     │   (/admin/backtest)   │
     └───────────┬───────────┘                     └───────────┬───────────┘
                 │                                             │
                 └──────────────────────┬──────────────────────┘
                                        ▼
                          ┌───────────────────────────┐
                          │        /v1 REST API       │
                          │   Search, Trends, Ingest, │
                          │   Index Math, Health      │
                          └─────────────┬─────────────┘
                                        ▼
                          ┌───────────────────────────┐
                          │   Neon PostgreSQL DB      │
                          │  quotes_raw → quotes_clean│
                          │  → index_values           │
                          └───────────────────────────┘
```

---

## 🌟 Feature Tour

### 1. Airfare Workspace
- **Landing Page (`/`)**: Public product overview and links into the signed-in workspace. It does not query private warehouse data.
- **Sign In (`/login`)**: Google first, Neon email/password secondary. Sign-in, verification, and redirect progress share one screen. Failed or cancelled sign-in preserves your destination; `/register` opens the account-creation stage.
- **Real-Time Airfare Price Index Dashboard (`/dashboard`)**:
  - Daily, weekly, and monthly APIx series.
  - Laspeyres, Jevons, T+21, chain-linked, and moving-mean series, with coverage, imputed share, and observation freshness.
  - Time window toggles: **30 Days**, **3 Months**, **6 Months**, and **All-Time**.
  - Deferred charts and index movement metrics without continuous background animation.
- **Flight Search & Price Compare (`/search`)**:
  - Origin & Destination route selectors across key domestic corridors.
  - Optional departure and cabin filters, one-way/round-trip selection, and shareable filter URLs.
  - **Fare Breakdown Table**: Paginated carrier observations with flight, departure, cabin, collection date, and fare components.
  - **Price History**: Independently loaded fare trends over 30 days, 3 months, 6 months, or all available history. Changing the history window does not reload the fare table. Searches read collected observations; they do not trigger scraping or book flights.
- **Route Relatives (`/routes`)**: Performance and current elementary price relatives across basket city-pairs.
- **Lead-Time Heatmap (`/heatmap`)**: Matrix visualizing how fares shift across advance-purchase windows ($T+1$ to $T+45$).
- **Price Elasticity (`/elasticity`)**: Non-linear fare surges plotted against booking advance days.

### 2. Admin & Operator Side
- **Operator Overview (`/admin`)**: Summary of collection pipelines, active data sources, and data warehouse volume.
- **Scraper Mechanism (`/admin/scrape`)**:
  - Trigger automated portal scrapes (`POST /v1/collect/run?scrape=true`).
  - Automated robots.txt compliance validation and respectful User-Agent headers.
  - Built-in politeness rate-limiting and anti-bot challenge detection (`status=blocked`).
  - Source-by-source status board reporting OK, missing, sold-out, and blocked quotes.
- **Manual Data Dump Area (`/admin/ingest`)**:
  - Direct data dump for manual collection from airline websites or aggregators.
  - **JSON/CSV/Prose Dump**: Paste observations into a tab-local draft; submit once and follow a durable job. Prose parsing requires the worker's `GEMINI_API_KEY`.
  - **CSV Upload**: Select a file up to 2 MB for worker-side parsing.
  - **Template Download**: One-click download of standardized CSV template.
  - **Auto Index Rebuild**: Worker performs ingestion, cleaning, and index construction. Job URLs survive navigation; polling pauses in hidden tabs and stops on completion/error.
- **DGCA Benchmark Backtest (`/admin/backtest`)**: Evaluates computed monthly APIx series against published DGCA Tariff Monitoring Unit (TMU) composites.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20.9+ (Node.js 22 recommended); Next.js 16 is required by Neon Auth
- A Neon PostgreSQL database account (or standard PostgreSQL instance)

### 1. Installation

```bash
git clone https://github.com/HimanshuM685/OpusAirs.git
cd OpusAirs
npm ci
```

### 2. Configure Environment

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your database connection string and Neon Auth credentials:
```bash
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require

# Neon Auth (Managed Better Auth) - Google and public email/password
NEON_AUTH_BASE_URL=https://ep-xxxxx.neonauth.region.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=change_this_to_at_least_32_characters_secret_string

# Whitelisted Google accounts permitted operator access to /admin
ADMIN_EMAILS=admin@example.com,operator@example.com

SCRAPE_ENABLED=false
INGEST_API_KEY=
CPI_AIR_WEIGHT=0.004
MAPE_TARGET=0.08
SNAPSHOT_HOURS=6,18
APIX_BASE_DATE=2026-08-01
```

In Neon Console, enable Auth for the database branch, configure Google OAuth, and enable email/password sign-in. Add `http://localhost:3000` and your HTTPS deployment origin to trusted origins. Use Google's authorized redirect URI shown by Neon (the hosted Neon `/callback/google` endpoint); the app finishes OAuth at `/auth/callback`.

Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -hex 32`. This dedicated secret and `NEON_AUTH_BASE_URL` are required; no default Auth URL/secret is used. Admin authorization requires a verified email in `ADMIN_EMAILS` **and** a completed Google OAuth session. An allowlisted password login or an upstream `role=admin` alone never grants operator access. Empty `ADMIN_EMAILS` denies all operators.

Dependencies pin the Better Auth API-key plugin/core to the SDK's `1.6.23` line to prevent incompatible transitive peer upgrades. Install with `npm ci`; no `--legacy-peer-deps` or `--force` is required.

### 3. Run Development Server

```bash
npm run dev
```

- Public User Interface: [http://localhost:3000](http://localhost:3000)
- User Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard) (sign-in required)
- Price Check: [http://localhost:3000/search](http://localhost:3000/search) (sign-in required)
- User Sign In / Register: [http://localhost:3000/login](http://localhost:3000/login) & [http://localhost:3000/register](http://localhost:3000/register) (Google recommended; Neon email/password secondary)
- Operator / Admin Suite: [http://localhost:3000/admin](http://localhost:3000/admin) (Google OAuth sign-in; granted if account email is listed in `ADMIN_EMAILS`)
- API Root: [http://localhost:3000/v1/index](http://localhost:3000/v1/index) (authenticated session required)

Legacy local password accounts and `opus_session`/`opus_admin` cookies no longer authenticate. Existing users should sign in or register through Neon Auth. Warehouse data remains intact.

### 4. Run the Background Worker

In a second terminal, from the project root:

```bash
npm run collect:worker
```

The web process queues collection, discovery, ingestion, and rebuild jobs; the worker executes them against the same database. Without a running worker, submitted jobs remain queued. `npm run collect:worker -- --once` schedules due work and drains the current queue once. Scraping still requires explicit collection configuration; offline/manual ingestion works with `SCRAPE_ENABLED=false`.

For a Vercel web deployment, you can run this command on your computer using the same Neon `DATABASE_URL` in `.env.local` (or `.env`). Keep the terminal open and the computer awake. The worker prints a `worker: "started"` event after connecting; the collection page shows running jobs and their last heartbeat. Vercel's environment variables do not automatically configure the local worker, so set `SCRAPE_ENABLED` and optional collection keys locally too. A queued job is already saved; it does not need to be submitted again.

### Request and Session Behavior

- Anonymous analytics/admin requests return to `/login` with the requested path and query preserved. APIs deny unauthorized calls before warehouse initialization or data reads.
- Client reads have bounded timeouts, shared in-flight requests, short-lived tab-local caching, and stale-response cancellation. Mutations are never automatically retried.
- Session expiry and cross-tab sign-out return to staged sign-in. Sign-out revokes the Neon session and clears local cached data and ingestion drafts.
- Tables are paginated and charts load near the viewport. Filter state stays in the URL; loading, empty, error, and retry states are explicit.

---

## 📥 Ingesting Data

You can feed airfare quote data using any of the following methods:

For command-line examples, configure `INGEST_API_KEY` on the server and export the same value in your shell. The key is limited to documented ingestion/collection/rebuild and job-status endpoints; it does not grant analytics or general operator access. Browser operators use their authorized Neon Google session.

1. **Admin UI**: Navigate to [http://localhost:3000/admin/ingest](http://localhost:3000/admin/ingest) and upload CSV or paste JSON.
2. **API (JSON)**:
   ```bash
   curl -X POST http://localhost:3000/v1/ingest/quotes \
     -H "x-api-key: $INGEST_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"rebuild_index": true, "quotes": [{"source":"manual","origin":"DEL","destination":"BOM","carrier":"6E","dep_date":"2026-09-20","total_fare":4850}]}'
   ```
3. **API (CSV)**:
   ```bash
   curl -X POST http://localhost:3000/v1/ingest/csv \
     -H "x-api-key: $INGEST_API_KEY" \
     -F "file=@data/quotes_manual.example.csv"
   ```
4. **Trigger Scrape**:
   ```bash
   curl -X POST "http://localhost:3000/v1/collect/run?scrape=true" \
     -H "x-api-key: $INGEST_API_KEY"
   ```

---

Each submission returns `202 { "job_id": "..." }`. Read `/v1/jobs/{job_id}` with the same credentials until `status` is `ok` or `error`. Text input is limited to 500,000 characters, JSON batches to 2,000 quotes, and CSV files to 2 MB.

## Verification

```bash
npm test
npm run build
# Install browser binaries outside .next, which builds can clean:
npx playwright-core install chromium
node scripts/verify-experience.mjs
```

The browser harness starts its own production server on port 3101 with fixture Neon/warehouse responses and stops it afterwards. It checks real route gates, navigation, request lifecycles, sign-out, and mobile layout. It does not validate live Google credentials or production latency. On Linux, browser setup may also require `npx playwright-core install-deps chromium`. PostgreSQL integration is opt-in; see [verification evidence](docs/OPTIMIZATION.md) for the PGlite command and measured local results.

## 📚 Documentation

- [docs/API.md](docs/API.md) — Complete REST API specification and query parameters.
- [docs/SCHEMA.md](docs/SCHEMA.md) — Warehouse SQL schemas, CSV specifications, and upsert logic.
- [docs/COLLECTION.md](docs/COLLECTION.md) — Collection methodology, scraper safety, and rate limits.
- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) — Jevons, Laspeyres, MAD cleaning, and T+21 economic principles.
- [Deploy.md](Deploy.md) / [docs/Deploy.md](docs/Deploy.md) — Deployment instructions for Vercel and Docker.
- [docs/OPTIMIZATION.md](docs/OPTIMIZATION.md) — Optimization decisions, local measurements, and verification limits.
