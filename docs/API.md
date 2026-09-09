# NSO / RBI API

Base URL: `http://127.0.0.1:8000`

Auth: header `X-API-Key` (default `nso-demo-key`). OpenAPI UI: `/docs`.

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness, no auth |
| GET | `/v1/index?frequency=daily\|weekly\|monthly&series=apix_laspeyres` | National APIx. Other series: `apix_jevons`, `apix_t21` |
| GET | `/v1/index/routes/{origin}/{dest}` | Route-level APIx |
| GET | `/v1/quotes` | Filters: `origin`, `dest`, `carrier`, `lead_time`, `collected_on`, `limit` |
| GET | `/v1/heatmap` | Route × day APIx cells; optional `lead_time` for lowest fare |
| GET | `/v1/elasticity` | Mean total fare by lead time; optional `origin`, `dest` |
| GET | `/v1/routes` | PSD basket with latest index/fare |
| GET | `/v1/health/collection` | Last run per source, including `blocked` counts |
| GET | `/v1/backtest/dgca` | Monthly APIx vs TMU-style / published DGCA composite |
| POST | `/v1/collect/run?mock=true` | Trigger Playwright collect against the mock airline |

Example:

```bash
curl -H 'X-API-Key: nso-demo-key' \
  'http://127.0.0.1:8000/v1/index?frequency=monthly'
```
