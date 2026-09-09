from __future__ import annotations

import hashlib
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from app.basket import CARRIERS, FARE_CLASS, LEAD_MULT, LEAD_TIMES, ROUTE_BASE_FARES, load_psd_basket
from app.config import get_settings

SEED_START = date(2026, 8, 1)
SEED_DAYS = 35
RNG_SEED = 42


def _components(base: float, convenience: float = 0.0) -> dict[str, float]:
    taxes = round(base * 0.12, 2)
    udf = 350.0
    total = round(base + taxes + udf + convenience, 2)
    return {
        "base_fare": round(base, 2),
        "taxes": taxes,
        "udf": udf,
        "convenience": convenience,
        "total_fare": total,
    }


def generate_quotes(start: date = SEED_START, days: int = SEED_DAYS) -> list[dict]:
    rng = random.Random(RNG_SEED)
    routes = load_psd_basket()
    rows: list[dict] = []
    for offset in range(days):
        collected_on = start + timedelta(days=offset)
        trend = 1.0 + 0.0007 * offset
        weekend = 1.12 if collected_on.weekday() >= 5 else (1.08 if collected_on.weekday() == 4 else 1.0)
        for route in routes:
            base0 = ROUTE_BASE_FARES.get((route.origin, route.destination), 4500.0)
            for lt in LEAD_TIMES:
                dep = collected_on + timedelta(days=lt)
                for code, _name in CARRIERS:
                    carrier_mult = {"6E": 0.95, "AI": 1.08, "IX": 0.92, "QP": 0.90, "SG": 1.02}[code]
                    noise = rng.uniform(0.93, 1.07)
                    base = base0 * LEAD_MULT[lt] * carrier_mult * weekend * trend * noise
                    status = "sold_out" if rng.random() < 0.03 else "ok"
                    if rng.random() < 0.004:
                        base *= 8.0  # outlier for the cleaner to flag
                    conv = 99.0 if rng.random() < 0.2 else 0.0
                    parts = _components(base, conv)
                    digest = hashlib.md5(f"{route.origin}{route.destination}{code}{lt}".encode()).hexdigest()
                    flight_no = f"{code}{100 + (int(digest[:4], 16) % 800)}"
                    row = {
                        "source": "fixture",
                        "origin": route.origin,
                        "destination": route.destination,
                        "carrier": code,
                        "flight_no": flight_no,
                        "dep_date": dep.isoformat(),
                        "fare_class": FARE_CLASS,
                        "lead_time_days": lt,
                        "collected_on": collected_on.isoformat(),
                        "collected_at": datetime.combine(collected_on, datetime.min.time()).isoformat(),
                        "status": status,
                        **parts,
                    }
                    if status == "sold_out":
                        row.update(
                            {
                                "base_fare": None,
                                "taxes": None,
                                "udf": None,
                                "convenience": None,
                                "total_fare": None,
                            }
                        )
                    rows.append(row)
    return rows


def generate_dgca_rows(quotes: list[dict]) -> list[dict]:
    """TMU-style monthly averages: mean of observed totals (not lowest-fare Jevons)."""
    from collections import defaultdict

    by_route_month: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    by_month: dict[str, list[float]] = defaultdict(list)
    for q in quotes:
        if q.get("status") != "ok" or q.get("total_fare") is None:
            continue
        month = q["collected_on"][:7] + "-01"
        by_route_month[(q["origin"], q["destination"], month)].append(float(q["total_fare"]))
        by_month[month].append(float(q["total_fare"]))

    rows: list[dict] = []
    # Published-style 72-route TMU composite (parliamentary replies, Jun 2026 vs Mar 2025).
    rows.append(
        {
            "month": "2025-03-01",
            "origin": "",
            "destination": "",
            "metric": "tmu_72_route_index",
            "value": "100.0",
            "note": "Rebased parliamentary/DGCA TMU composite; Mar 2025 = 100",
        }
    )
    rows.append(
        {
            "month": "2025-05-01",
            "origin": "",
            "destination": "",
            "metric": "tmu_72_route_index",
            "value": "100.8",
            "note": "Interpolated between Mar 2025 and Jun 2026 TMU movement",
        }
    )
    rows.append(
        {
            "month": "2026-06-01",
            "origin": "",
            "destination": "",
            "metric": "tmu_72_route_index",
            "value": "120.5",
            "note": "Approx +20.5% vs Mar 2025 on 72 domestic sectors (Rajya Sabha / DGCA TMU)",
        }
    )

    month_avgs = {m: sum(v) / len(v) for m, v in by_month.items()}
    first_month = min(month_avgs)
    base_avg = month_avgs[first_month]
    for month, avg in sorted(month_avgs.items()):
        rows.append(
            {
                "month": month,
                "origin": "",
                "destination": "",
                "metric": "tmu_basket_avg_fare",
                "value": f"{avg:.2f}",
                "note": "Mean of reconstructed quotes (TMU-style random sampling analogue)",
            }
        )
        rows.append(
            {
                "month": month,
                "origin": "",
                "destination": "",
                "metric": "tmu_basket_index",
                "value": f"{100.0 * avg / base_avg:.4f}",
                "note": f"Rebased to {first_month} = 100 using TMU-style mean fares",
            }
        )

    for (origin, dest, month), vals in sorted(by_route_month.items()):
        rows.append(
            {
                "month": month,
                "origin": origin,
                "destination": dest,
                "metric": "tmu_route_avg_fare",
                "value": f"{sum(vals) / len(vals):.2f}",
                "note": "Route-level TMU analogue (mean fare, all carriers)",
            }
        )
    return rows


def write_seed_files(data_dir: Path | None = None) -> dict[str, int]:
    settings = get_settings()
    data_dir = data_dir or settings.data_dir
    data_dir.mkdir(parents=True, exist_ok=True)
    quotes = generate_quotes()
    jsonl = data_dir / "quotes_seed.jsonl"
    with jsonl.open("w", encoding="utf-8") as fh:
        for row in quotes:
            fh.write(json.dumps(row) + "\n")
    dgca = generate_dgca_rows(quotes)
    csv_path = data_dir / "dgca_benchmark.csv"
    with csv_path.open("w", encoding="utf-8") as fh:
        fh.write("month,origin,destination,metric,value,note\n")
        for row in dgca:
            note = row["note"].replace('"', "'")
            fh.write(
                f"{row['month']},{row['origin']},{row['destination']},{row['metric']},{row['value']},\"{note}\"\n"
            )
    return {"quotes": len(quotes), "dgca_rows": len(dgca)}


if __name__ == "__main__":
    print(write_seed_files())
