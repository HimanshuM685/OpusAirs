# Graph Report - .  (2026-09-10)

## Corpus Check
- Corpus is ~10,364 words - fits in a single context window. You may not need a graph.

## Summary
- 281 nodes · 606 edges · 22 communities (18 shown, 4 thin omitted)
- Extraction: 66% EXTRACTED · 34% INFERRED · 0% AMBIGUOUS · INFERRED: 206 edges (avg confidence: 0.55)
- Token cost: 46,494 input · 1,800 output

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
- [[_COMMUNITY_Project Root|Project Root]]

## God Nodes (most connected - your core abstractions)
1. `Session` - 20 edges
2. `get_settings()` - 20 edges
3. `QuoteClean` - 17 edges
4. `CollectionEvent` - 16 edges
5. `compilerOptions` - 16 edges
6. `BasketRoute` - 15 edges
7. `CollectionRun` - 15 edges
8. `IndexValue` - 15 edges
9. `IndexPoint` - 13 edges
10. `run_pipeline()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Laspeyres APIx aggregation` --semantically_similar_to--> `OpusAirs Airfare Price Index (APIx)`  [INFERRED] [semantically similar]
  docs/METHODOLOGY.md → README.md
- `Path` --uses--> `BasketRoute`  [INFERRED]
  backend/app/basket.py → backend/app/models.py
- `Session` --uses--> `BasketRoute`  [INFERRED]
  backend/app/basket.py → backend/app/models.py
- `BasketRoute` --uses--> `BasketRoute`  [INFERRED]
  backend/app/basket.py → backend/app/models.py
- `Session` --uses--> `IndexValue`  [INFERRED]
  backend/app/index/construct.py → backend/app/models.py

## Import Cycles
- 1-file cycle: `backend/app/main.py -> backend/app/main.py`

## Hyperedges (group relationships)
- **APIx methodology pipeline** — methodology_outlier_cleaning, methodology_jevons_elementary_price, methodology_laspeyres_apix, methodology_psd_basket [EXTRACTED 1.00]
- **Collector safeguards** — collection_robotsgate, collection_hostlimiter, collection_ethical_collection_policy [EXTRACTED 1.00]

## Communities (22 total, 4 thin omitted)

### Community 0 - "API Endpoints"
Cohesion: 0.20
Nodes (38): backtest_dgca(), collection_health(), get_elasticity(), get_heatmap(), get_index(), get_quotes(), get_route_index(), list_routes() (+30 more)

### Community 1 - "App Bootstrap & Config"
Cohesion: 0.10
Nodes (25): bootstrap(), main(), _raw_key(), _default_data_dir(), _connect_args(), get_engine(), get_session(), get_session_factory() (+17 more)

### Community 2 - "Basket & Pipeline"
Cohesion: 0.09
Nodes (27): load_psd_basket(), RouteSpec, sync_basket(), Path, Session, date, Session, date (+19 more)

### Community 3 - "Collector Settings & Auth"
Cohesion: 0.11
Nodes (17): require_api_key(), get_settings(), Settings, CollectionEvent, date, date, BaseSettings, backoff_sleep() (+9 more)

### Community 4 - "Collection Persistence"
Cohesion: 0.18
Nodes (21): persist_events(), run_pipeline(), DgcaBenchmark, QuoteRaw, CollectionEvent, date, Session, CollectionEvent (+13 more)

### Community 5 - "Dashboard Pages"
Cohesion: 0.13
Nodes (11): color(), HeatmapPage(), api(), BacktestRow, BacktestSummary, CollectionHealth, ElasticityPoint, HeatmapCell (+3 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 7 - "Frontend Dependencies"
Cohesion: 0.11
Nodes (17): dependencies, next, react, react-dom, recharts, devDependencies, @types/node, @types/react (+9 more)

### Community 8 - "Docs & Methodology"
Cohesion: 0.15
Nodes (17): NSO/RBI /v1 REST API, X-API-Key auth, Amadeus GDS adapter (env-gated), Ethical collection policy (no CAPTCHA bypass), HostLimiter rate limiting, RobotsGate (robots.txt enforcement), Docker compose stack (mock-airline, api, web), DGCA TMU backtest (+9 more)

### Community 9 - "Seed Data Generation"
Cohesion: 0.29
Nodes (8): _components(), generate_dgca_rows(), generate_quotes(), TMU-style monthly averages: mean of observed totals (not lowest-fare Jevons)., write_seed_files(), date, Path, test_seed_has_thirty_five_days()

### Community 10 - "Mock Airline Server"
Cohesion: 0.29
Nodes (4): api_flights(), _flights(), date, Local JS-rendered airline search UI for ethical Playwright demos. Not a real car

## Knowledge Gaps
- **52 isolated node(s):** `date`, `Path`, `Engine`, `Session`, `date` (+47 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_settings()` connect `Collector Settings & Auth` to `App Bootstrap & Config`, `Basket & Pipeline`, `Collection Persistence`, `Seed Data Generation`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `FastAPI` connect `App Bootstrap & Config` to `API Endpoints`, `Mock Airline Server`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `CollectionEvent` connect `Collection Persistence` to `Collector Settings & Auth`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `Session` (e.g. with `BasketRoute` and `CollectionRun`) actually correct?**
  _`Session` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `get_settings()` (e.g. with `require_api_key()` and `test_playwright_scrapes_mock_airline()`) actually correct?**
  _`get_settings()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `QuoteClean` (e.g. with `Base` and `BacktestSummary`) actually correct?**
  _`QuoteClean` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `CollectionEvent` (e.g. with `CollectionEvent` and `date`) actually correct?**
  _`CollectionEvent` has 14 INFERRED edges - model-reasoned connections that need verification._