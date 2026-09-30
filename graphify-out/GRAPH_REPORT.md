# Graph Report - .  (2026-09-30)

## Corpus Check
- 43 files · ~35,705 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 436 nodes · 740 edges · 30 communities (18 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard Pages|Dashboard Pages]]
- [[_COMMUNITY_APIx Index Math|APIx Index Math]]
- [[_COMMUNITY_Collect Airports & Jobs|Collect Airports & Jobs]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_Deploy & API Concepts|Deploy & API Concepts]]
- [[_COMMUNITY_Admin Session & Collect API|Admin Session & Collect API]]
- [[_COMMUNITY_Collect HTTP Layer|Collect HTTP Layer]]
- [[_COMMUNITY_Demo UI Components|Demo UI Components]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Ingest & Parse Dump|Ingest & Parse Dump]]
- [[_COMMUNITY_Glyph Portal UI|Glyph Portal UI]]
- [[_COMMUNITY_Caveman Agent Rules|Caveman Agent Rules]]
- [[_COMMUNITY_Admin Layout Shell|Admin Layout Shell]]
- [[_COMMUNITY_Root App Layout|Root App Layout]]
- [[_COMMUNITY_Ingest Admin Page|Ingest Admin Page]]
- [[_COMMUNITY_DGCA Methodology|DGCA Methodology]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Auto-Clarity Exception|Auto-Clarity Exception]]
- [[_COMMUNITY_Elasticity API Docs|Elasticity API Docs]]
- [[_COMMUNITY_Heatmap API Docs|Heatmap API Docs]]
- [[_COMMUNITY_Trends API Docs|Trends API Docs]]
- [[_COMMUNITY_Schema Basket Routes|Schema Basket Routes]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Windsurf Caveman Rules|Windsurf Caveman Rules]]

## God Nodes (most connected - your core abstractions)
1. `handleV1()` - 26 edges
2. `runPipeline()` - 22 edges
3. `Q` - 20 edges
4. `compilerOptions` - 16 edges
5. `sql()` - 12 edges
6. `isoDate()` - 12 edges
7. `api()` - 11 edges
8. `cleanQuotes()` - 11 edges
9. `OpusAirs` - 10 edges
10. `loginResponse()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .opencode/AGENTS.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  AGENTS.md → .clinerules/caveman.md
- `OpusAirs deployment guide (docs)` --semantically_similar_to--> `OpusAirs deployment guide`  [INFERRED] [semantically similar]
  docs/Deploy.md → Deploy.md
- `register()` --calls--> `bootstrap()`  [INFERRED]
  instrumentation.ts → lib/bootstrap.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Dual-channel quote ingestion (scrape + manual)** — docs_collection_automated_scraper, docs_collection_manual_dump_area, docs_collection_quotes_raw, docs_api_post_v1_collect_run, docs_api_post_v1_ingest_quotes [EXTRACTED 1.00]
- **Clean quotes and publish APIx index series** — docs_api_post_v1_index_rebuild, docs_api_table_quotes_clean, docs_api_table_index_values, docs_api_get_v1_index, docs_collection_rebuild_index_flag [INFERRED 0.85]
- **Ethical scraping guardrails** — docs_collection_ethical_robots_txt, docs_collection_user_agent, docs_collection_live_rate_limit_seconds, docs_collection_max_searches_per_run, docs_collection_no_captcha_bypass [EXTRACTED 1.00]

## Communities (30 total, 12 thin omitted)

### Community 0 - "Dashboard Pages"
Cohesion: 0.06
Nodes (30): IndexAreaChart, Point, Props, WINDOWS, Props, TopRouteCard, TopRouteCardInner(), color() (+22 more)

### Community 1 - "APIx Index Math"
Cohesion: 0.08
Nodes (37): register(), constructIndex(), jevons(), computeBacktest(), corr(), mom(), DDL, LEAD_TIMES (+29 more)

### Community 2 - "Collect Airports & Jobs"
Cohesion: 0.11
Nodes (36): loadAirports(), acquireLock(), asJob(), claimNext(), countStatus(), expandJobs(), finishJob(), jobSummary() (+28 more)

### Community 3 - "API Route Handlers"
Cohesion: 0.12
Nodes (37): handleV1(), iata(), json(), loginResponse(), qnum(), validIata(), adminConfigured(), adminSeedEmail() (+29 more)

### Community 4 - "Deploy & API Concepts"
Cohesion: 0.06
Nodes (41): Docker Compose web service, Airfare Price Index (APIx), DGCA TMU published 72-route benchmark, Unified Next.js application origin (base URL), Elementary Jevons prices aggregated across routes, data/dgca_benchmark.csv, GET /v1/backtest/dgca, GET /v1/index (+33 more)

### Community 5 - "Admin Session & Collect API"
Cohesion: 0.05
Nodes (41): Admin session cookie (admin endpoints), opus_session cookie, data/psd_basket.csv, GET /v1/collect/jobs, GET /v1/health/collection, GET /v1/ingest/needed, GET /v1/ingest/template, GET /v1/quotes (+33 more)

### Community 6 - "Collect HTTP Layer"
Cohesion: 0.09
Nodes (22): defineHtmlSource(), FetchResult, fetchText(), sleep(), attrs(), Cabin, CABINS, ParsedLeg (+14 more)

### Community 7 - "Demo UI Components"
Cohesion: 0.12
Nodes (6): Gradient, GradientWave(), GradientWaveProps, MiniGl, Me, navLinks

### Community 8 - "Frontend Dependencies"
Cohesion: 0.09
Nodes (21): dependencies, @neondatabase/serverless, next, react, react-dom, recharts, devDependencies, tsx (+13 more)

### Community 9 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 10 - "Ingest & Parse Dump"
Cohesion: 0.29
Nodes (10): QuoteIn, chatJson(), env(), LlmCfg, llmConfig(), loadDotEnv(), parseDump(), parseWithLlm() (+2 more)

### Community 11 - "Glyph Portal UI"
Cohesion: 0.24
Nodes (7): clamp(), GlyphPortal(), GlyphPortalProps, GlyphPortalStyle, Ink, Letter, smooth()

### Community 12 - "Caveman Agent Rules"
Cohesion: 0.50
Nodes (4): Caveman communication style, Caveman communication style, Caveman communication style, Caveman communication style

## Knowledge Gaps
- **115 isolated node(s):** `metadata`, `Ctx`, `GlyphPortalStyle`, `GlyphPortalProps`, `Ink` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sql()` connect `APIx Index Math` to `Collect Airports & Jobs`, `API Route Handlers`, `Collect HTTP Layer`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `OpusAirs` connect `Deploy & API Concepts` to `Admin Session & Collect API`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `Dual-channel collection pipeline` connect `Admin Session & Collect API` to `Deploy & API Concepts`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Are the 18 inferred relationships involving `Q` (e.g. with `acquireLock()` and `claimNext()`) actually correct?**
  _`Q` has 18 INFERRED edges - model-reasoned connections that need verification._
- **What connects `metadata`, `Ctx`, `GlyphPortalStyle` to the rest of the system?**
  _121 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.056866303690260134 - nodes in this community are weakly interconnected._
- **Should `APIx Index Math` be split into smaller, more focused modules?**
  _Cohesion score 0.07890070921985816 - nodes in this community are weakly interconnected._