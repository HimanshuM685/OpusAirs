# Quote data schema

Scrapers and manual feeds write the **same** row into `quotes_raw`. Cleaning then fills `quotes_clean` and rebuilds APIx.

SQL (Neon / Postgres): [data/schema.sql](../data/schema.sql)

## Unique key (upsert)

`(source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)`

Send the same key again to correct a fare.

## CSV (`POST /v1/ingest/csv` or `data/quotes_manual.csv`)

Header row required. Template: [data/quotes_manual.example.csv](../data/quotes_manual.example.csv)

| Column | Required | Example | Notes |
|---|---|---|---|
| source | no | `manual` | Also `indigo`, `airindia`, `spicejet`, … |
| origin | yes | `DEL` | IATA |
| destination | yes | `BOM` | IATA |
| carrier | yes | `6E` | 6E AI IX QP SG |
| flight_no | no | `6E201` | `NA` if unknown |
| dep_date | yes | `2026-09-17` | Travel date |
| fare_class | no | `ECONOMY` | |
| lead_time_days | no | `7` | T+k; if omitted, `dep_date - collected_on` |
| collected_on | no | `2026-09-10` | Observation date (today if omitted) |
| base_fare | no | `4200` | INR |
| taxes | no | `504` | |
| udf | no | `350` | User development fee |
| convenience | no | `0` | OTA convenience |
| total_fare | if no base | `5054` | What the traveller pays |
| status | no | `ok` | `ok` \| `sold_out` \| `missing` \| `blocked` \| `cancelled` |

If only `total_fare` is set, the cleaner splits an approximate base / tax / UDF / convenience.

Drop a file at `data/quotes_manual.csv` and restart the API — it upserts on boot.

## JSON (`POST /v1/ingest/quotes`)

```json
{
  "rebuild_index": true,
  "quotes": [
    {
      "source": "manual",
      "origin": "DEL",
      "destination": "BOM",
      "carrier": "6E",
      "flight_no": "6E201",
      "dep_date": "2026-09-17",
      "fare_class": "ECONOMY",
      "lead_time_days": 7,
      "collected_on": "2026-09-10",
      "base_fare": 4200,
      "taxes": 504,
      "udf": 350,
      "convenience": 0,
      "total_fare": 5054,
      "status": "ok"
    }
  ]
}
```

Header: `X-API-Key`. Dashboard: **/ingest**.

## Scrape path

`POST /v1/collect/run?scrape=true` (or `python -m app.collect --scrape`).

Sources and CSS selectors: [data/scrape_sources.json](../data/scrape_sources.json). Robots.txt is checked; CAPTCHA pages are stored as `blocked`, not solved.
