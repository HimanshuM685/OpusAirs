# Collection policy

Two paths write the same `quotes_raw` rows in **Neon**: live portal scrape from the Next.js `/v1` API, and manual ingest (CSV / JSON).

## Will not implement

- Mock airline or generated fare seeds
- CAPTCHA solving, proxy / IP rotation, anti-bot bypass

When a page looks like a challenge, the collector records `status=blocked` and you paste the fare via [SCHEMA.md](SCHEMA.md).

## What is implemented

1. **Live portals** — HTTP fetch against URLs in `data/scrape_sources.json`. Robots.txt, identifiable User-Agent, rate limit, abort on CAPTCHA.
2. **Manual ingest** — `POST /v1/ingest/quotes`, `POST /v1/ingest/csv`, dashboard **/ingest**.
3. **DGCA benchmark** — published TMU composite in `data/dgca_benchmark.csv`.

Set `DATABASE_URL` to a Neon URI. Tables are created when the Next.js app first hits `/v1`.
