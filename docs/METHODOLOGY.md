# APIx methodology

OpusAirs constructs a Real-time Airfare Price Index (APIx) aligned with CPI elementary-aggregate practice (Jevons) and Laspeyres aggregation, and with BLS airline-fare pricing (fixed trip specification; taxes included).

## Quote specification

- One-way economy, 1 adult
- Same collected-on weekday mapped to a departure date at a fixed lead time
- Lead times: **T+1, T+7, T+15, T+21, T+30, T+45**
- T+21 is included because the MoSPI Expert Group on CPI 2024 recommended a 21-day advance-purchase window for domestic airfares
- Price is the **total fare paid** (base + taxes + user development fee + convenience), stored as separate components

## Basket and weights

Routes and raw passenger counts live in `data/psd_basket.csv`. Weights are \(w_i = p_i / \sum p_j\).

NSO Price Statistics Division can replace this file with official routes and weights without code changes (`sync_basket` on startup).

Default pairs (DGCA-style 2023–24 city-pair volumes, leisure mix via DEL-GOI):

DEL-BOM, DEL-BLR, BOM-BLR, DEL-HYD, DEL-CCU, DEL-PNQ, BOM-MAA, DEL-AMD, MAA-DEL, BOM-HYD, BLR-HYD, DEL-GOI.

## Elementary price

For each route \(i\), collected-on day \(t\), and lead time \(\ell\), take the **lowest non-outlier economy total** \(P_{i\ell t}\).

Missing \(\ell\) are carried forward from the last observed cell and flagged (`imputed_share`).

Route elementary price is the **Jevons** mean across observed lead times:

\[
P_{it} = \exp\left(\frac{1}{L_{it}}\sum_{\ell}\ln P_{i\ell t}\right)
\]

## Base period

`APIX_BASE_DATE` (default 2026-08-01). \(P_{i0}\) is the Jevons mean of \(P_{it}\) over the first seven dates at or after the base date. Index = 100 in that window when prices are flat.

## Laspeyres APIx

\[
I_t = 100 \times \sum_i w_i \frac{P_{it}}{P_{i0}}
\]

Also published:

- `apix_jevons` — unweighted Jevons of route relatives
- `apix_t21` — Laspeyres using T+21 fares only (CPI 2024 comparable)
- `apix_route` — route relatives × 100

## Frequency

- Daily: \(I_t\)
- Weekly: mean of daily \(I_t\) in the week ending Wednesday
- Monthly: calendar-month mean of daily \(I_t\)

## Cleaning

- Drop sold-out / cancelled / blocked / missing
- Deduplicate on source, OD, carrier, flight, departure date, fare class, collected-on, lead time
- Split fare components; if only total is present, apply a documented residual split
- MAD (fallback IQR) outlier flags by route × lead time; outliers excluded from elementary prices

## Backtest

See `/v1/backtest/dgca`. Monthly APIx is compared with a TMU-style **mean** fare index on the same reconstructed sample (DGCA TMU samples airline websites monthly on ~72 routes; it does not publish a public daily dump). The published 72-route composite (+20.5% June 2026 vs March 2025, parliamentary reply) is stored for context.
