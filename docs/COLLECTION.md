# Collection policy

Two paths write the same `quotes_raw` schema: **live Playwright portal scrape** and **manual ingest** (CSV / JSON / `data/quotes_manual.csv`).

The SIH text asks for CAPTCHA handling, IP rotation **and** robots.txt / ToS compliance. Those cannot be combined. OpusAirs scrapes politely and stops on a challenge.

## Will not implement

- CAPTCHA solving
- Proxy / IP rotation to evade blocks
- Circumventing Cloudflare / Akamai

When a page looks like a challenge, the collector records `status=blocked` and you paste the fare via [SCHEMA.md](SCHEMA.md).

## What is implemented

1. **Live portals** — Playwright against airline start/search URLs in `data/scrape_sources.json` (IndiGo, Air India, Air India Express, Akasa, SpiceJet). Robots.txt, identifiable User-Agent, slow per-host rate limit, abort on CAPTCHA. Tune CSS selectors in that JSON.
2. **Manual ingest** — `POST /v1/ingest/quotes`, `POST /v1/ingest/csv`, dashboard **/ingest**, optional `data/quotes_manual.csv` on boot.
3. **Fixture seed** — 35-day reconstructed series so the index works before the first live/manual row.
4. **DGCA benchmark** — `data/dgca_benchmark.csv`.
5. **Amadeus adapter** — skipped unless `AMADEUS_API_KEY` is set.

## Safeguards

- `RobotsGate` (`urllib.robotparser`); fail closed on remote hosts
- User-Agent: `OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in; ethical-cpi-research)`
- Live rate limit default 8s / host (`LIVE_RATE_LIMIT_SECONDS`)
- Cap searches per run (`data/scrape_sources.json` → `max_searches_per_run`)
- Abort on challenge markers / 401 / 403 / 429

## Production path for NSO

1. Replace `data/psd_basket.csv` with official PSD routes and weights.
2. Prefer data partnerships / DGCA TMU extracts for operational collection.
3. Keep scrape + manual feed as the high-frequency layer.
4. Cleaning and APIx modules stay the same — only the source of `quotes_raw` changes.
