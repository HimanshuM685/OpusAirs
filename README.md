# OpusAirs — Real-time Airfare Price Index (APIx)

SIH 2026 [SIH26056](https://sih2026.vuce.in/ps/SIH26056). One **Next.js** app: dashboard + `/v1` API. Quotes in **Neon**.

## Run

Copy `.env.example` to `.env.local` and set `DATABASE_URL`.

```bash
npm install
npm run dev
```

Open http://localhost:3000  
API: http://localhost:3000/v1/index

## Feed data

- Dashboard **/admin/ingest** (CSV / JSON)
- `POST /v1/ingest/quotes`
- `POST /v1/collect/run?scrape=true`

Schema: [docs/SCHEMA.md](docs/SCHEMA.md) · Deploy: [Deploy.md](Deploy.md)
