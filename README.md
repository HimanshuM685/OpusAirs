# OpusAirs — Real-time Airfare Price Index (APIx)

SIH 2026 [SIH26056](https://sih2026.vuce.in/ps/SIH26056) (MoSPI / DIID). High-frequency airfare collection and a daily **Airfare Price Index** for NSO / RBI.

## Collection (both exist)

1. **Scrape** — Playwright against Indian airline portals (`data/scrape_sources.json`). robots.txt, rate limits, abort on CAPTCHA. No IP rotation.
2. **Manual feed** — same row schema via CSV / JSON. Dashboard **Feed quotes**, or `data/quotes_manual.csv`.

Schema: [docs/SCHEMA.md](docs/SCHEMA.md) · SQL: [data/schema.sql](data/schema.sql) · Deploy (Neon): [docs/Deploy.md](docs/Deploy.md)

## Quick start (local SQLite)

Requires Python 3.11+ and Node 20+.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m playwright install chromium
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' > .env.local
echo 'NEXT_PUBLIC_API_KEY=nso-demo-key' >> .env.local
npm run dev
```

Open http://localhost:3000. API: http://127.0.0.1:8000/docs (`X-API-Key: nso-demo-key`).

## Neon

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require'
# then start uvicorn as above
```

See [docs/Deploy.md](docs/Deploy.md).

## Scrape vs feed

```bash
# Live portals (polite; many hosts will return blocked — then use ingest)
cd backend && python -m app.collect --scrape --no-fixtures

# Or POST /v1/collect/run?scrape=true
# Manual: POST /v1/ingest/csv  or  /v1/ingest/quotes
```

## Tests

```bash
cd backend && pytest -q
```

## Layout

| Path | Role |
|---|---|
| `backend/` | FastAPI, scrapers, ingest, APIx |
| `frontend/` | Next.js 15 App Router |
| `data/psd_basket.csv` | PSD routes and weights |
| `data/schema.sql` | Warehouse DDL |
| `data/scrape_sources.json` | Portal URLs / selectors |
| `data/quotes_manual.example.csv` | Manual feed template |
| `docs/` | Methodology, schema, collection, deploy |
