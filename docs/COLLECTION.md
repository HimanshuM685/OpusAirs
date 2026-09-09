# Collection policy

The SIH statement asks the engine to handle CAPTCHAs, anti-bot systems and IP rotation **and** to remain compliant with robots.txt and terms of service. Those requirements cannot be implemented together. OpusAirs follows the ethical half, which is also the only path a statistical office can operate in production.

## Will not implement

- CAPTCHA solving or challenge-page automation
- Residential / datacenter proxy rotation to evade blocks
- Circumventing Cloudflare, Akamai or similar bot-management
- Scrapers aimed at IndiGo, Air India, SpiceJet, Akasa, MakeMyTrip, Yatra, EaseMyTrip, Cleartrip, Ixigo or Goibibo in violation of their terms

When a page looks like a challenge (`captcha`, `verify you are human`, HTTP 401/403/429), the collector **stops** and records `blocked`.

## What is implemented

1. **Playwright mock airline** (`mock_airline/`) — JS-rendered search results, sold-out states, tax split, robots.txt, identifiable User-Agent, per-host rate limit, session cookies for the collector’s own session.
2. **Fixture ingest** — 35+ days of reconstructed quotes in `data/quotes_seed.jsonl` so the index, API and dashboard work on day one.
3. **DGCA benchmark ingest** — `data/dgca_benchmark.csv`.
4. **Amadeus adapter** — skipped unless `AMADEUS_API_KEY` is set. This is a licensed GDS API, not website scraping.

## Safeguards on every HTTP/Playwright adapter

- `RobotsGate` via `urllib.robotparser`
- User-Agent: `OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in; ethical-cpi-research)`
- `HostLimiter` (default 0.4s between requests to the same host)
- Exponential backoff on 429/503
- Abort on challenge markers

## Production path for NSO

1. Replace `data/psd_basket.csv` with official PSD routes and weights.
2. Negotiate **data partnerships** with airlines / OTAs or consume DGCA Tariff Monitoring Unit extracts (the TMU already samples airline websites on ~78 routes).
3. Optionally attach Amadeus / NDC under contract for GDS-available content.
4. Keep the same cleaning and APIx modules — only the `FareCollector` adapters change.
