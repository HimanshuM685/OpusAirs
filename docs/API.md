# NSO / RBI API

Base URL: `http://127.0.0.1:8000`

Auth: header `X-API-Key`. OpenAPI: `/docs`. Schema: [SCHEMA.md](SCHEMA.md). Deploy: [Deploy.md](Deploy.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness, no auth |
| GET | `/v1/index?frequency=daily\|weekly\|monthly&series=apix_laspeyres` | National APIx. Also `apix_jevons`, `apix_t21` |
| GET | `/v1/index/routes/{origin}/{dest}` | Route-level APIx |
| GET | `/v1/quotes` | Filters: `origin`, `dest`, `carrier`, `lead_time`, `collected_on`, `limit` |
| GET | `/v1/heatmap` | Route × day; optional `lead_time` |
| GET | `/v1/elasticity` | Mean total fare by lead time |
| GET | `/v1/routes` | PSD basket |
| GET | `/v1/health/collection` | Last run per source |
| GET | `/v1/backtest/dgca` | Monthly APIx vs DGCA-style series |
| POST | `/v1/collect/run?scrape=true` | Playwright live portals |
| POST | `/v1/ingest/quotes` | JSON batch (manual feed) |
| POST | `/v1/ingest/csv` | CSV upload |
| GET | `/v1/ingest/template` | Example CSV |

```bash
curl -H 'X-API-Key: nso-demo-key' \
  'http://127.0.0.1:8000/v1/index?frequency=monthly'
```

```bash
curl -H 'X-API-Key: nso-demo-key' -H 'Content-Type: application/json' \
  -d @quotes.json \
  http://127.0.0.1:8000/v1/ingest/quotes
```
