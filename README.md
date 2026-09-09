# OpusAirs — Real-time Airfare Price Index (APIx)

SIH 2026 problem [SIH26056](https://sih2026.vuce.in/ps/SIH26056) (MoSPI / DIID). Automated, high-frequency airfare collection and a daily **Airfare Price Index** that NSO and RBI can consume.

## What this prototype does

- Collects quotes for a **PSD-replaceable city-pair basket** at lead times T+1, T+7, T+15, T+21, T+30, T+45
- Cleans, de-duplicates, splits base / taxes / UDF / convenience, flags outliers
- Builds **Jevons** elementary prices and a **Laspeyres APIx** (daily / weekly / monthly)
- Serves a FastAPI `/v1` API and a Next.js dashboard (trends, heatmap, elasticity, DGCA backtest)
- Ships **35 days** of reconstructed quotes plus a DGCA TMU-style backtest

## What it does not do

It does **not** bypass CAPTCHAs, rotate IPs, or scrape airline/OTA sites in violation of their terms. See [docs/COLLECTION.md](docs/COLLECTION.md). Live extraction is demonstrated against a local JS-rendered mock airline with Playwright. Optional licensed GDS (Amadeus) is env-gated.

## Quick start (local)

Requires Python 3.11+ and Node 20+.

```bash
# 1. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m playwright install chromium
python -m app.seed
uvicorn app.main:app --reload --port 8000

# 2. Mock airline (optional, for Playwright demo)
cd mock_airline
pip install fastapi uvicorn
uvicorn server:app --port 8090

# 3. Collect from mock (optional)
cd backend
python -m app.collect --mock --no-fixtures --date 2026-09-09

# 4. Dashboard
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' > .env.local
echo 'NEXT_PUBLIC_API_KEY=nso-demo-key' >> .env.local
npm run dev
```

Open http://localhost:3000. API docs: http://127.0.0.1:8000/docs  
Header: `X-API-Key: nso-demo-key`

## Docker

```bash
docker compose up --build
```

Dashboard at http://localhost:3000, API at http://localhost:8000.

## Tests

```bash
cd backend
pytest -q
```

## Layout

| Path | Role |
|---|---|
| `backend/` | FastAPI, collectors, cleaning, APIx |
| `frontend/` | Next.js 15 App Router dashboard |
| `mock_airline/` | JS-rendered search UI for ethical Playwright demos |
| `data/psd_basket.csv` | Drop-in NSO/PSD routes and passenger weights |
| `docs/` | Methodology, collection policy, API |

## Demo for judges

1. Start stack; dashboard shows 35-day APIx and DGCA comparison.
2. On **Collection health**, run mock collect (Playwright extracts JS-rendered fares).
3. `curl -H 'X-API-Key: nso-demo-key' http://127.0.0.1:8000/v1/index?frequency=daily`
