# Deploy

Neon (Postgres) + API + Next.js. Full notes: [docs/Deploy.md](docs/Deploy.md).

## Neon

Create a project at https://neon.tech and copy the URI:

```
postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
```

Tables are created when the API starts. Optional: run `data/schema.sql` in the Neon SQL editor.

## API

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxxx.region.aws.neon.tech/neondb?sslmode=require
API_KEY=choose-a-long-secret
CORS_ORIGINS=https://YOUR-APP.vercel.app,http://localhost:3000
SCRAPE_ENABLED=false
```

## Frontend

```
NEXT_PUBLIC_API_URL=https://your-api.example.com
NEXT_PUBLIC_API_KEY=choose-a-long-secret
```

## Local against Neon

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

Host the API (Render / Railway / Fly) and the Next app (Vercel). Leave `SCRAPE_ENABLED=false` until you want the nightly Playwright job; CSV/JSON ingest works without a browser.
