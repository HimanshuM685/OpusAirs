# Deploy

Neon (Postgres) + API + Next.js dashboard.

## 1. Neon

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the connection string (pooled is fine).
3. It looks like:

```
postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
```

Tables are created on API boot (`create_all`). Optional: run [data/schema.sql](../data/schema.sql) in the Neon SQL editor.

## 2. API env

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
API_KEY=choose-a-long-secret
CORS_ORIGINS=https://YOUR-APP.vercel.app,http://localhost:3000
DATA_DIR=/data
SCRAPE_ENABLED=false
COLLECT_ENABLED=true
```

`SCRAPE_ENABLED=true` turns on the 02:30 daily Playwright job. Leave false until you want live hits; feed CSV/JSON anytime.

## 3. Frontend env

```
NEXT_PUBLIC_API_URL=https://your-api.example.com
NEXT_PUBLIC_API_KEY=choose-a-long-secret
```

Same `API_KEY` as the backend.

## 4. Run locally against Neon

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m playwright install chromium
export DATABASE_URL='postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require'
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8000' > .env.local
echo 'NEXT_PUBLIC_API_KEY=choose-a-long-secret' >> .env.local
npm install && npm run dev
```

## 5. Typical hosting

| Piece | Where |
|---|---|
| Database | Neon |
| FastAPI | Render / Railway / Fly — Docker `backend/Dockerfile`, port 8000 |
| Next.js | Vercel — root `frontend/`, set the two `NEXT_PUBLIC_*` vars |

On the API host, install Chromium if you enable scrape (`playwright install --with-deps chromium`). Manual ingest does not need a browser.
