# Graph Report - .  (2026-09-30)

## Corpus Check
- 56 files · ~31,671 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 300 nodes · 531 edges · 26 communities (18 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Dashboard Pages|Dashboard Pages]]
- [[_COMMUNITY_API Route Handlers|API Route Handlers]]
- [[_COMMUNITY_APIx Index Math|APIx Index Math]]
- [[_COMMUNITY_REST API Docs|REST API Docs]]
- [[_COMMUNITY_Quote Ingest Pipeline|Quote Ingest Pipeline]]
- [[_COMMUNITY_Demo UI Components|Demo UI Components]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Frontend Dependencies|Frontend Dependencies]]
- [[_COMMUNITY_Glyph Portal UI|Glyph Portal UI]]
- [[_COMMUNITY_Data Collection|Data Collection]]
- [[_COMMUNITY_FastAPI Route Module|FastAPI Route Module]]
- [[_COMMUNITY_Caveman Agent Rules|Caveman Agent Rules]]
- [[_COMMUNITY_Admin Layout Shell|Admin Layout Shell]]
- [[_COMMUNITY_Root App Layout|Root App Layout]]
- [[_COMMUNITY_DGCA Backtest Methodology|DGCA Backtest Methodology]]
- [[_COMMUNITY_Ingest Admin Page|Ingest Admin Page]]
- [[_COMMUNITY_Collection Ethics|Collection Ethics]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_Auto-Clarity Exception|Auto-Clarity Exception]]
- [[_COMMUNITY_Project README|Project README]]
- [[_COMMUNITY_Windsurf Caveman Rules|Windsurf Caveman Rules]]

## God Nodes (most connected - your core abstractions)
1. `handleV1()` - 29 edges
2. `sql()` - 18 edges
3. `isoDate()` - 16 edges
4. `compilerOptions` - 16 edges
5. `api()` - 11 edges
6. `OpusAirs` - 11 edges
7. `constructIndex()` - 10 edges
8. `cleanQuotes()` - 10 edges
9. `loadPsdBasket()` - 9 edges
10. `scrapePortals()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .github/copilot-instructions.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  .opencode/AGENTS.md → .clinerules/caveman.md
- `Caveman communication style` --semantically_similar_to--> `Caveman communication style`  [INFERRED] [semantically similar]
  AGENTS.md → .clinerules/caveman.md
- `/v1 REST API` --semantically_similar_to--> `OpusAirs /v1 REST API reference`  [INFERRED] [semantically similar]
  README.md → docs/API.md
- `OpusAirs deployment guide (docs)` --semantically_similar_to--> `OpusAirs deployment guide`  [INFERRED] [semantically similar]
  docs/Deploy.md → Deploy.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Identical caveman agent communication rules across IDE/tool configs** — clinerules_caveman_caveman_communication_style, github_copilot_instructions_caveman_communication_style, opencode_agents_caveman_communication_style, windsurf_rules_caveman_caveman_communication_style, root_agents_caveman_communication_style [INFERRED 0.95]
- **Published APIx index series variants (Laspeyres, Jevons, T+21)** — docs_api_series_apix_laspeyres, docs_api_series_apix_jevons, docs_api_series_apix_t21 [EXTRACTED 1.00]
- **Quote warehouse ETL chain from raw ingest to index_values** — docs_schema_quotes_raw, docs_schema_quotes_clean, docs_schema_index_values [EXTRACTED 1.00]

## Communities (26 total, 8 thin omitted)

### Community 0 - "Dashboard Pages"
Cohesion: 0.09
Nodes (21): CITY, WINDOWS, color(), HeatmapPage(), api(), BacktestRow, BacktestSummary, CarrierFare (+13 more)

### Community 1 - "API Route Handlers"
Cohesion: 0.13
Nodes (38): handleV1(), iata(), json(), loginResponse(), mapIndex(), mapQuote(), qnum(), validIata() (+30 more)

### Community 2 - "APIx Index Math"
Cohesion: 0.10
Nodes (30): register(), constructIndex(), jevons(), DDL, LEAD_TIMES, loadPsdBasket(), RouteSpec, cleanQuotes() (+22 more)

### Community 3 - "REST API Docs"
Cohesion: 0.08
Nodes (35): Docker Compose web service, GET /v1/index, POST /v1/index/rebuild, data/psd_basket.csv market basket, apix_jevons index series, apix_laspeyres index series, apix_t21 index series (21-day advance purchase), OpusAirs /v1 REST API reference (+27 more)

### Community 4 - "Quote Ingest Pipeline"
Cohesion: 0.12
Nodes (23): asDate(), CARRIER_CODES, cell(), CollectionEvent, normalizeCarrier(), normalizeTripType(), optFloat(), parseCsvQuotes() (+15 more)

### Community 5 - "Demo UI Components"
Cohesion: 0.12
Nodes (6): Gradient, GradientWave(), GradientWaveProps, MiniGl, Me, navLinks

### Community 6 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, @neondatabase/serverless, next, react, react-dom, recharts, devDependencies, @types/node (+10 more)

### Community 8 - "Glyph Portal UI"
Cohesion: 0.24
Nodes (7): clamp(), GlyphPortal(), GlyphPortalProps, GlyphPortalStyle, Ink, Letter, smooth()

### Community 9 - "Data Collection"
Cohesion: 0.29
Nodes (7): opus_session session cookie authentication, POST /v1/collect/run, Automated live web scraper, collection_runs audit log, Politeness rate-limiting (LIVE_RATE_LIMIT_SECONDS), Robots.txt adherence before scraping, data/scrape_sources.json search budget caps

### Community 10 - "FastAPI Route Module"
Cohesion: 0.60
Nodes (4): Ctx, GET(), POST(), run()

### Community 11 - "Caveman Agent Rules"
Cohesion: 0.50
Nodes (4): Caveman communication style, Caveman communication style, Caveman communication style, Caveman communication style

### Community 14 - "DGCA Backtest Methodology"
Cohesion: 1.00
Nodes (3): GET /v1/backtest/dgca, data/dgca_benchmark.csv, DGCA Tariff Monitoring Unit (TMU) 72-route benchmark

## Knowledge Gaps
- **73 isolated node(s):** `NeededCell`, `navLinks`, `WINDOWS`, `CITY`, `navLinks` (+68 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleV1()` connect `API Route Handlers` to `APIx Index Math`, `FastAPI Route Module`, `Quote Ingest Pipeline`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `NeededCell`, `navLinks`, `WINDOWS` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dashboard Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.08826945412311266 - nodes in this community are weakly interconnected._
- **Should `API Route Handlers` be split into smaller, more focused modules?**
  _Cohesion score 0.12659698025551683 - nodes in this community are weakly interconnected._
- **Should `APIx Index Math` be split into smaller, more focused modules?**
  _Cohesion score 0.09986504723346828 - nodes in this community are weakly interconnected._
- **Should `REST API Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.08235294117647059 - nodes in this community are weakly interconnected._
- **Should `Quote Ingest Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.1225071225071225 - nodes in this community are weakly interconnected._