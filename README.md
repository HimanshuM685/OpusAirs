# OpusAirs — Real-time Airfare Price Index (APIx)

> Smart India Hackathon 2026 — [SIH26056](https://sih2026.vuce.in/ps/SIH26056)  
> High-frequency airfare collection, Laspeyres/Jevons price index construction, and route analytics for MoSPI / NSO and RBI.

OpusAirs is a full-stack Next.js platform powered by serverless PostgreSQL (Neon). It delivers a **two-sided architecture**: a public consumer interface for flight search, carrier fare comparison, and macroeconomic price indices, alongside a dedicated operator/admin suite for web scraping, multi-source data ingestion, and benchmark validation.

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

### 1. User Side (Public Portal)
- **Landing Page (`/`)**: Hero overview, live APIx index ticker, real-time pulse metrics, direct navigation into flight search or macro analytics.
- **Real-Time Airfare Price Index Dashboard (`/dashboard`)**:
  - Daily, weekly, and monthly APIx series.
  - Multi-series methodology: **Laspeyres APIx** (weighted basket), **Jevons** (unweighted geometric mean), and **T+21** (MoSPI 2024 advance-purchase recommendation).
  - Time window toggles: **30 Days**, **3 Months**, **6 Months**, and **All-Time**.
  - Interactive gradient area charts and index movement metrics.
- **Flight Search & Price Compare (`/search`)**:
  - Origin & Destination route selectors across key domestic corridors.
  - **Carrier Comparison Bar Chart**: Compare latest fares across airlines (IndiGo, Air India, Akasa, SpiceJet, AI Express).
  - **Fares Breakdown Table**: Displays carrier, flight number, departure date, lead time, base fare, taxes, and total fare.
  - **Historical Price Gain Tracking**: Visual trend chart tracking fare evolution over **last 30 days**, **last 3 months**, and **last 6 months**, with real-time price gain percentage badges.
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
  - **JSON Dump**: Paste structured quote arrays directly for instant upsert.
  - **CSV Upload**: Drag-and-drop CSV quote batches with automatic parsing.
  - **Template Download**: One-click download of standardized CSV template.
  - **Auto Index Rebuild**: Automatically triggers data cleaning (deduplication, component estimation, MAD outlier detection) and rebuilds the APIx index.
- **DGCA Benchmark Backtest (`/admin/backtest`)**: Evaluates computed monthly APIx series against published DGCA Tariff Monitoring Unit (TMU) composites.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or 20.x
- A Neon PostgreSQL database account (or standard PostgreSQL instance)

### 1. Installation

```bash
git clone https://github.com/HimanshuM685/OpusAirs.git
cd OpusAirs
npm install
```

### 2. Configure Environment

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your database connection string and operator credentials:
```bash
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
ADMIN_EMAIL=admin@local
ADMIN_PASSWORD=change_this_to_a_secure_password
SESSION_SECRET=change_this_long_random_string
SCRAPE_ENABLED=false
APIX_BASE_DATE=2026-08-01
```

### 3. Run Development Server

```bash
npm run dev
```

- Public User Interface: [http://localhost:3000](http://localhost:3000)
- User Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Flight Search & Compare: [http://localhost:3000/search](http://localhost:3000/search)
- Hidden Operator / Admin Suite: [http://localhost:3000/admin](http://localhost:3000/admin) (admin email + password from `users` table; seeded as `ADMIN_EMAIL`)
- API Root: [http://localhost:3000/v1/index](http://localhost:3000/v1/index)

---

## 📥 Ingesting Data

You can feed airfare quote data using any of the following methods:

1. **Admin UI**: Navigate to [http://localhost:3000/admin/ingest](http://localhost:3000/admin/ingest) and upload CSV or paste JSON.
2. **API (JSON)**:
   ```bash
   curl -X POST http://localhost:3000/v1/ingest/quotes \
     -H "Content-Type: application/json" \
     -d '{"rebuild_index": true, "quotes": [{"source":"manual","origin":"DEL","destination":"BOM","carrier":"6E","dep_date":"2026-09-20","total_fare":4850}]}'
   ```
3. **API (CSV)**:
   ```bash
   curl -X POST http://localhost:3000/v1/ingest/csv \
     -F "file=@data/quotes_manual.example.csv"
   ```
4. **Trigger Scrape**:
   ```bash
   curl -X POST "http://localhost:3000/v1/collect/run?scrape=true"
   ```

---

## 📚 Documentation

- [docs/API.md](docs/API.md) — Complete REST API specification and query parameters.
- [docs/SCHEMA.md](docs/SCHEMA.md) — Warehouse SQL schemas, CSV specifications, and upsert logic.
- [docs/COLLECTION.md](docs/COLLECTION.md) — Collection methodology, scraper safety, and rate limits.
- [docs/METHODOLOGY.md](docs/METHODOLOGY.md) — Jevons, Laspeyres, MAD cleaning, and T+21 economic principles.
- [Deploy.md](Deploy.md) / [docs/Deploy.md](docs/Deploy.md) — Deployment instructions for Vercel and Docker.
