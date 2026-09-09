# NSO / RBI API

Base URL: the Next.js origin (local `http://localhost:3000`).

| Method | Path |
|---|---|
| GET | `/v1/index?frequency=daily\|weekly\|monthly&series=apix_laspeyres` |
| GET | `/v1/index/routes/{origin}/{dest}` |
| GET | `/v1/quotes` |
| GET | `/v1/heatmap` |
| GET | `/v1/elasticity` |
| GET | `/v1/routes` |
| GET | `/v1/search?origin=DEL&dest=BOM` |
| GET | `/v1/trends/{origin}/{dest}?window=30d` |
| GET | `/v1/health/collection` |
| GET | `/v1/backtest/dgca` |
| POST | `/v1/collect/run?scrape=true` |
| POST | `/v1/ingest/quotes` |
| POST | `/v1/ingest/csv` |
| GET | `/v1/ingest/template` |
