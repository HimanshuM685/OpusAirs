# Data Warehouse Schema & Ingest Formats

OpusAirs stores airfare observations in PostgreSQL (Neon serverless). Both automated scrapers and manual data dumps feed into `quotes_raw`, which is then processed through cleaning stages into `quotes_clean` and summarized into `index_values`.

SQL Reference: [data/schema.sql](../data/schema.sql)

---

## 1. Relational Tables

### `quotes_raw`
Raw observations collected from airline sites, OTAs, or manual uploads.
- Unique Upsert Constraint:
  ```sql
  UNIQUE (source, origin, destination, carrier, flight_no, dep_date, fare_class, collected_on, lead_time_days)
  ```
- Submitting an identical key updates the existing record with the latest fare.

### `quotes_clean`
Cleaned fares used for index compilation and search comparison:
- Excludes status `sold_out`, `missing`, `blocked`, and `cancelled`.
- Imputes missing fare components (base, taxes, UDF, convenience) using standardized airline proportions.
- Flags and filters outliers (`is_outlier = 1`) using Median Absolute Deviation (MAD), falling back to Interquartile Range (IQR).

### `index_values`
Computed Airfare Price Index time series:
- `series`: `apix_laspeyres` (weighted basket), `apix_jevons` (unweighted), `apix_t21` (21-day advance), or `apix_route` (route relatives).
- `frequency`: `daily`, `weekly`, `monthly`.
- `period_date`: Reference date.
- `value`: Normalized index value ($100.0$ at base date `APIX_BASE_DATE`).
- `imputed_share`: Proportion of route cells carried forward due to missing observations.

### `basket_routes`
Fixed market basket populated from `data/psd_basket.csv` containing city pairs (e.g. `DEL-BOM`, `DEL-BLR`) and passenger traffic weights.

### `collection_runs`
Audit log recording every scraper execution and manual ingest batch.

---

## 2. Ingest Formats

### CSV Format (`POST /v1/ingest/csv` and Admin File Upload)
Header row is required. Download template via `GET /v1/ingest/template` or [data/quotes_manual.example.csv](../data/quotes_manual.example.csv).

| Column | Required | Example | Description |
|---|---|---|---|
| `source` | No | `manual` | Source identifier (`indigo`, `airindia`, `manual`, `makemytrip`, etc.) |
| `origin` | **Yes** | `DEL` | 3-letter IATA origin airport code |
| `destination` | **Yes** | `BOM` | 3-letter IATA destination airport code |
| `carrier` | **Yes** | `6E` | 2-letter IATA airline code (`6E`, `AI`, `QP`, `SG`, `IX`) |
| `flight_no` | No | `6E201` | Flight number (defaults to `NA`) |
| `dep_date` | **Yes** | `2026-09-20` | Scheduled flight departure date (`YYYY-MM-DD`) |
| `fare_class` | No | `ECONOMY` | Cabin class (defaults to `ECONOMY`) |
| `lead_time_days` | No | `7` | Advance purchase days ($dep\_date - collected\_on$ if omitted) |
| `collected_on` | No | `2026-09-13` | Date fare was observed (defaults to current date) |
| `base_fare` | No | `3800` | Base fare in INR |
| `taxes` | No | `450` | Government and airport taxes in INR |
| `udf` | No | `250` | User Development Fee in INR |
| `convenience` | No | `0` | Booking convenience fee in INR |
| `total_fare` | Conditional | `4500` | Total traveller fare (required if `base_fare` is absent) |
| `status` | No | `ok` | `ok` \| `sold_out` \| `missing` \| `blocked` \| `cancelled` |

### JSON Format (`POST /v1/ingest/quotes` and Admin JSON Dump)

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
      "dep_date": "2026-09-20",
      "fare_class": "ECONOMY",
      "lead_time_days": 7,
      "collected_on": "2026-09-13",
      "base_fare": 3800,
      "taxes": 450,
      "udf": 250,
      "convenience": 0,
      "total_fare": 4500,
      "status": "ok"
    }
  ]
}
```

---

## 3. Data Flow to Consumer Features

```
quotes_raw
    │
    ▼ (cleanQuotes: dedup, split components, MAD filter)
quotes_clean
    ├─────────────────────────────┬─────────────────────────────┐
    ▼                             ▼                             ▼
GET /v1/search               GET /v1/trends              constructIndex()
(Cheapest fare by carrier    (Historical fare movement    (Jevons elementary →
 on selected city pair)       & 30d/3m/6m price gain)     Laspeyres index_values)
```
