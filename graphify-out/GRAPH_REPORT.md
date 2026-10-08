# Graph Report - OpusAirs  (2026-10-09)

## Corpus Check
- 99 files · ~49,346 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .csv 4, (none) 3, .mdc 1)

## Summary
- 590 nodes · 1329 edges · 31 communities (20 shown, 11 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `14098cee`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.ts
- run.ts
- index.ts
- api-routes.ts
- Deploy & API Concepts
- Admin Session & Collect API
- ingest.ts
- GradientWave
- package.json
- TypeScript Config
- parse-dump.ts
- Glyph Portal UI
- Admin Layout Shell
- Root App Layout
- Ingest Admin Page
- api
- DGCA Methodology
- Login Page
- policy.ts
- v1/[...path]/route.ts
- User Layout Template
- Elasticity API Docs
- Heatmap API Docs
- Trends API Docs
- Schema Basket Routes
- Project README
- [pair]/page.tsx

## God Nodes (most connected - your core abstractions)
1. `handleV1()` - 50 edges
2. `sql()` - 30 edges
3. `runPipeline()` - 28 edges
4. `isoDate()` - 26 edges
5. `react` - 26 edges
6. `api()` - 21 edges
7. `istDate()` - 16 edges
8. `compilerOptions` - 16 edges
9. `PoliteHttp` - 15 edges
10. `defineHtmlSource()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .opencode/AGENTS.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  AGENTS.md → .clinerules/caveman.md
- `OpusAirs deployment guide (docs)` --semantically_similar_to--> `OpusAirs deployment guide`  [INFERRED] [semantically similar]
  docs/Deploy.md → Deploy.md
- `AdminOverviewPage()` --calls--> `api()`  [EXTRACTED]
  app/(admin)/admin/page.tsx → lib/api.ts

## Import Cycles
- 3-file cycle: `lib/apix.ts -> lib/snapshot.ts -> lib/ingest.ts -> lib/apix.ts`

## Hyperedges (group relationships)
- **Dual-channel quote ingestion (scrape + manual)** — docs_collection_automated_scraper, docs_collection_manual_dump_area, docs_collection_quotes_raw, docs_api_post_v1_collect_run, docs_api_post_v1_ingest_quotes [EXTRACTED 1.00]
- **Ethical scraping guardrails** — docs_collection_ethical_robots_txt, docs_collection_user_agent, docs_collection_live_rate_limit_seconds, docs_collection_max_searches_per_run, docs_collection_no_captcha_bypass [EXTRACTED 1.00]
- **Clean quotes and publish APIx index series** — docs_api_post_v1_index_rebuild, docs_api_table_quotes_clean, docs_api_table_index_values, docs_api_get_v1_index, docs_collection_rebuild_index_flag [INFERRED 0.85]

## Communities (31 total, 11 thin omitted)

### Community 0 - "api.ts"
Cohesion: 0.24
Nodes (9): AdminOverviewPage(), ScrapePage(), toggle(), AdapterHealth, apiPost(), BacktestRow, CarrierFare, CollectionHealth (+1 more)

### Community 1 - "run.ts"
Cohesion: 0.08
Nodes (44): ALERT_WEBHOOK high block-rate alerts, COLLECT_MAX_HOURS (default 18h run cap), npm run collect:daily cron pipeline, bootstrap(), cell, q, acquireLock(), buildWorklist() (+36 more)

### Community 2 - "index.ts"
Cohesion: 0.10
Nodes (29): defineHtmlSource(), botUserAgent(), CHALLENGE, FetchResult, HttpAttempt, Options, PoliteHttp, sharedHttp() (+21 more)

### Community 3 - "api-routes.ts"
Cohesion: 0.06
Nodes (68): register(), handleV1(), searchRows(), iata(), ingestAllowed(), ingestHits, json(), loginResponse() (+60 more)

### Community 4 - "Deploy & API Concepts"
Cohesion: 0.06
Nodes (36): Docker Compose web service, Airfare Price Index (APIx), DGCA TMU published 72-route benchmark, Unified Next.js application origin (base URL), data/dgca_benchmark.csv, GET /v1/backtest/dgca, GET /v1/index, GET /v1/index/routes/{origin}/{dest} (+28 more)

### Community 5 - "Admin Session & Collect API"
Cohesion: 0.06
Nodes (35): Admin session cookie (admin endpoints), opus_session cookie, data/psd_basket.csv, GET /v1/collect/jobs, GET /v1/health/collection, GET /v1/ingest/needed, GET /v1/ingest/template, GET /v1/quotes (+27 more)

### Community 6 - "ingest.ts"
Cohesion: 0.08
Nodes (52): constructIndex(), loadBasket(), cleanQuotes(), addDays(), istDate(), basket, fileDrop(), isoDate() (+44 more)

### Community 7 - "GradientWave"
Cohesion: 0.07
Nodes (19): AdminLayout(), GoogleIcon(), navLinks, Me, navLinks, UserLayout(), GoogleIcon(), LoginPage() (+11 more)

### Community 8 - "package.json"
Cohesion: 0.05
Nodes (38): DELETE, GET, PATCH, POST, PUT, runtime, auth, dependencies (+30 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 10 - "parse-dump.ts"
Cohesion: 0.35
Nodes (10): chatJson(), env(), LlmCfg, llmConfig(), loadDotEnv(), parseDump(), parseWithLlm(), quotesFromJson() (+2 more)

### Community 11 - "Glyph Portal UI"
Cohesion: 0.19
Nodes (11): fareAxis(), SearchPage(), TREND_WINDOWS, Point, Props, SearchResult, TrendPoint, CHART_TOOLTIP_STYLE (+3 more)

### Community 13 - "Admin Layout Shell"
Cohesion: 0.24
Nodes (11): LandingPage(), clamp(), GlyphPortal(), GlyphPortalProps, GlyphPortalStyle, Ink, interior(), Letter (+3 more)

### Community 15 - "Ingest Admin Page"
Cohesion: 0.27
Nodes (8): DashboardPage(), WINDOWS, IndexAreaChart, Props, TopRouteCard, TopRouteCardInner(), CITY, cityLabel()

### Community 16 - "api"
Cohesion: 0.21
Nodes (11): BacktestPage(), ElasticityPage(), color(), HeatmapPage(), RoutesPage(), JellyAnimatedHero(), JellyAnimatedHeroProps, api() (+3 more)

### Community 18 - "Login Page"
Cohesion: 0.32
Nodes (5): IngestPage(), loadNeeded(), sendCsv(), sendDump(), NeededCell

### Community 19 - "policy.ts"
Cohesion: 0.16
Nodes (17): lowestEconomyCells(), madFlags(), median(), parseAmount(), quantile(), RawQuote, splitFareComponents(), completeness() (+9 more)

### Community 20 - "v1/[...path]/route.ts"
Cohesion: 0.38
Nodes (6): Ctx, GET(), maxDuration, POST(), run(), runtime

### Community 21 - "User Layout Template"
Cohesion: 0.50
Nodes (3): Answer, Q: explore the project ... find context graph . in graphify-out folder, Source Nodes

### Community 30 - "[pair]/page.tsx"
Cohesion: 0.33
Nodes (4): RouteDetailPage(), ElasticityPoint, QuoteOut, recharts

## Knowledge Gaps
- **150 isolated node(s):** `NeededCell`, `navLinks`, `WINDOWS`, `navLinks`, `Me` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 190 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@neondatabase/serverless` connect `package.json` to `run.ts`?**
  _High betweenness centrality (0.342) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `handleV1()` (e.g. with `mapIndex()` and `mapQuote()`) actually correct?**
  _`handleV1()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `NeededCell`, `navLinks`, `WINDOWS` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `run.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07869742198100407 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Root App Layout` to `api.ts`, `GradientWave`, `package.json`, `Glyph Portal UI`, `Admin Layout Shell`, `Ingest Admin Page`, `api`, `Login Page`, `[pair]/page.tsx`?**
  _High betweenness centrality (0.272) - this node is a cross-community bridge._
- **Should `index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10119047619047619 - nodes in this community are weakly interconnected._
- **Should `api-routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06004543979227524 - nodes in this community are weakly interconnected._