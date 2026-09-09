# Graph Report - OpusAirs  (2026-09-10)

## Corpus Check
- 51 files · ~23,717 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 320 nodes · 522 edges · 27 communities (22 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2046889c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_API Endpoints|API Endpoints]]
- [[_COMMUNITY_App Bootstrap & Config|App Bootstrap & Config]]
- [[_COMMUNITY_Basket & Pipeline|Basket & Pipeline]]
- [[_COMMUNITY_Collector Settings & Auth|Collector Settings & Auth]]
- [[_COMMUNITY_Collection Persistence|Collection Persistence]]
- [[_COMMUNITY_Dashboard Pages|Dashboard Pages]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Docs & Methodology|Docs & Methodology]]
- [[_COMMUNITY_Seed Data Generation|Seed Data Generation]]
- [[_COMMUNITY_Mock Airline Server|Mock Airline Server]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Backend Package Init|Backend Package Init]]
- [[_COMMUNITY_Next Config|Next Config]]
- [[_COMMUNITY_Package Init|Package Init]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `handleV1()` - 29 edges
2. `sql()` - 18 edges
3. `isoDate()` - 16 edges
4. `compilerOptions` - 16 edges
5. `api()` - 11 edges
6. `bootstrap()` - 11 edges
7. `constructIndex()` - 10 edges
8. `cleanQuotes()` - 10 edges
9. `4. Admin, Scraping & Ingestion` - 10 edges
10. `loadPsdBasket()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Laspeyres APIx aggregation` --semantically_similar_to--> `OpusAirs Airfare Price Index (APIx)`  [INFERRED] [semantically similar]
  docs/METHODOLOGY.md → README.md
- `run()` --calls--> `handleV1()`  [EXTRACTED]
  app/v1/[...path]/route.ts → lib/api-routes.ts
- `register()` --calls--> `bootstrap()`  [INFERRED]
  instrumentation.ts → lib/bootstrap.ts
- `OpusAirs Airfare Price Index (APIx)` --references--> `Ethical collection policy (no CAPTCHA bypass)`  [EXTRACTED]
  README.md → docs/COLLECTION.md
- `NSO/RBI /v1 REST API` --references--> `FastAPI backend`  [EXTRACTED]
  docs/API.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **APIx methodology pipeline** — methodology_outlier_cleaning, methodology_jevons_elementary_price, methodology_laspeyres_apix, methodology_psd_basket [EXTRACTED 1.00]
- **Collector safeguards** — collection_robotsgate, collection_hostlimiter, collection_ethical_collection_policy [EXTRACTED 1.00]

## Communities (27 total, 5 thin omitted)

### Community 0 - "API Endpoints"
Cohesion: 0.14
Nodes (33): handleV1(), iata(), json(), loginResponse(), mapIndex(), mapQuote(), qnum(), validIata() (+25 more)

### Community 1 - "App Bootstrap & Config"
Cohesion: 0.05
Nodes (31): 1. Environment Configuration, 2. Local Node.js Deployment, 3. Docker Deployment, 4. Vercel + Neon Cloud Deployment, Manual Docker Build:, OpusAirs — Deployment Guide, Using Docker Compose:, OpusAirs /v1 REST API Reference (+23 more)

### Community 2 - "Basket & Pipeline"
Cohesion: 0.15
Nodes (21): constructIndex(), jevons(), LEAD_TIMES, loadPsdBasket(), cleanQuotes(), lowestEconomyCells(), madFlags(), median() (+13 more)

### Community 3 - "Collector Settings & Auth"
Cohesion: 0.07
Nodes (28): 1. Airfare Price Index, 2. Flight Search & Price Comparison, 3. Analytics & Basket, 4. Admin, Scraping & Ingestion, 5. Auth, Detailed Endpoint Documentation, `GET /v1/auth/me`, `GET /v1/backtest/dgca` (+20 more)

### Community 4 - "Collection Persistence"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 5 - "Dashboard Pages"
Cohesion: 0.09
Nodes (16): WINDOWS, color(), HeatmapPage(), api(), BacktestRow, BacktestSummary, CarrierFare, CollectionHealth (+8 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): dependencies, @neondatabase/serverless, next, react, react-dom, recharts, devDependencies, @types/node (+10 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.17
Nodes (11): 1. Relational Tables, 2. Ingest Formats, 3. Data Flow to Consumer Features, `basket_routes`, `collection_runs`, CSV Format (`POST /v1/ingest/csv` and Admin File Upload), Data Warehouse Schema & Ingest Formats, `index_values` (+3 more)

### Community 8 - "Docs & Methodology"
Cohesion: 0.15
Nodes (17): NSO/RBI /v1 REST API, X-API-Key auth, Amadeus GDS adapter (env-gated), Ethical collection policy (no CAPTCHA bypass), HostLimiter rate limiting, RobotsGate (robots.txt enforcement), Docker compose stack (mock-airline, api, web), DGCA TMU backtest (+9 more)

### Community 9 - "Seed Data Generation"
Cohesion: 0.22
Nodes (9): 1. Quote Specification, 2. Market Basket & City-Pair Weights, 3. Elementary Price Index (Jevons Formulation), 4. Aggregate Laspeyres APIx, 5. Aggregation Frequencies, 6. Outlier Detection & Cleaning, 7. DGCA Benchmark Backtesting, Additional Published Series (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.19
Nodes (15): cell(), CollectionEvent, normalizeTripType(), optFloat(), parseCsvQuotes(), QuoteIn, toEvent(), TripType (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (13): register(), adminSeedEmail(), adminSeedPassword(), ensureSeedAdmin(), hashPassword(), bootstrap(), DDL, RouteSpec (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (8): settings, clamp(), GlyphPortal(), GlyphPortalProps, GlyphPortalStyle, Ink, Letter, smooth()

### Community 26 - "Community 26"
Cohesion: 0.60
Nodes (4): Ctx, GET(), POST(), run()

## Knowledge Gaps
- **124 isolated node(s):** `NeededCell`, `navLinks`, `WINDOWS`, `navLinks`, `Me` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Detailed Endpoint Documentation` connect `Collector Settings & Auth` to `App Bootstrap & Config`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `OpusAirs /v1 REST API Reference` connect `App Bootstrap & Config` to `Collector Settings & Auth`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `NeededCell`, `navLinks`, `WINDOWS` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Endpoints` be split into smaller, more focused modules?**
  _Cohesion score 0.14414414414414414 - nodes in this community are weakly interconnected._
- **Should `App Bootstrap & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._
- **Should `Basket & Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.1452991452991453 - nodes in this community are weakly interconnected._
- **Should `Collector Settings & Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._