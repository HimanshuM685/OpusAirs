# OpusAirs APIx Methodology & Economic Specification

OpusAirs constructs the **Real-time Airfare Price Index (APIx)** aligned with international CPI best practices (elementary Jevons aggregation, Laspeyres upper-level synthesis) and guidelines from the **MoSPI Expert Group on CPI (2024)** and the **U.S. Bureau of Labor Statistics (BLS)**.

---

## 1. Quote Specification

To maintain a consistent, constant-quality pricing target over time:
- **Product Definition**: Standard one-way economy airfare for a single adult passenger.
- **Components Included**: Total purchaser price (base fare + fuel surcharge + airport user development fee / UDF + applicable taxes).
- **Advance Booking Schedule**: Fixed lead times relative to observation date:
  $$\ell \in \{1, 7, 15, 21, 30, 45\}\text{ days}$$
- **T+21 Inclusion**: Specifically tracks the 21-day advance purchase window recommended by the MoSPI Expert Group on CPI (2024) for representative domestic travel pricing.

---

## 2. Market Basket & City-Pair Weights

Routes and passenger weights are configured in `data/psd_basket.csv`. The default basket reflects major domestic passenger routes published by DGCA (Delhi, Mumbai, Bengaluru, Hyderabad, Kolkata, Chennai, Pune, Ahmedabad, Goa):

$$w_i = \frac{p_i}{\sum_{j=1}^{N} p_j}$$

Where $p_i$ is the annual passenger volume for city pair $i$. NSO / MoSPI can update basket weights dynamically without code redeployment.

---

## 3. Elementary Price Index (Jevons Formulation)

For each route $i$, collection date $t$, and advance purchase window $\ell$, the system selects the lowest non-outlier total fare $P_{i\ell t}$.

Missing cells $\ell$ are carried forward from the most recent valid observation and tracked via `imputed_share`.

The elementary price $P_{it}$ for route $i$ on day $t$ is calculated as the unweighted geometric mean (**Jevons Index**) across lead times:

$$P_{it} = \left(\prod_{\ell \in L} P_{i\ell t}\right)^{1 / |L|} = \exp\left(\frac{1}{|L|}\sum_{\ell \in L}\ln P_{i\ell t}\right)$$

---

## 4. Aggregate Laspeyres APIx

Base period prices $P_{i0}$ are computed as the geometric mean over the initial base period starting at `APIX_BASE_DATE` (default: `2026-08-01`).

The aggregate Laspeyres Airfare Price Index at time $t$ is:

$$I_t = 100 \times \sum_{i=1}^{N} w_i \frac{P_{it}}{P_{i0}}$$

### Additional Published Series
- **`apix_laspeyres`**: Primary headline index with passenger weights.
- **`apix_jevons`**: Unweighted geometric relative index across routes.
- **`apix_t21`**: Laspeyres index restricted solely to $T+21$ bookings (MoSPI CPI 2024 comparable).
- **`apix_route`**: Route-specific relatives normalized to $100.0$ at base date.

---

## 5. Aggregation Frequencies

- **Daily**: Computed directly for every observation day $t$.
- **Weekly**: Arithmetic average of daily indices for weeks ending Wednesday (harmonized with WPI reporting).
- **Monthly**: Calendar-month mean of daily index values (harmonized with headline CPI reporting).

---

## 6. Outlier Detection & Cleaning

Before index compilation or flight search aggregation:
1. **Deduplication**: Exact keys on source, route, carrier, flight, dates, and lead time are deduplicated.
2. **Component Residuals**: If an external feed provides only `total_fare`, component shares (base, tax, UDF, convenience) are estimated using empirical airline proportions.
3. **Robust Outlier Filtering**: Median Absolute Deviation (MAD) is applied within each route $\times$ lead time window:
   $$\text{MAD} = \text{median}(|P_k - \text{median}(P)|)$$
   Fares deviating beyond $3.5 \times \text{MAD}$ (or fallback $1.5 \times \text{IQR}$) are flagged as `is_outlier = 1` and excluded from elementary price computation.

---

## 7. DGCA Benchmark Backtesting

To validate real-world tracking, the computed monthly APIx is backtested against the published DGCA Tariff Monitoring Unit (TMU) 72-route composite index (`data/dgca_benchmark.csv`). Results and delta percentages are reported via `/admin/backtest` and `GET /v1/backtest/dgca`.
