from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.basket import LEAD_TIMES, load_psd_basket
from app.cleaning.pipeline import lowest_economy_cells
from app.config import get_settings
from app.models import IndexValue

SERIES_LASPEYRES = "apix_laspeyres"
SERIES_JEVONS = "apix_jevons"
SERIES_T21 = "apix_t21"
SERIES_ROUTE = "apix_route"


def jevons(values: list[float]) -> float | None:
    positives = [v for v in values if v > 0]
    if not positives:
        return None
    log_mean = sum(math.log(v) for v in positives) / len(positives)
    return math.exp(log_mean)


def _week_ending_wednesday(d: date) -> date:
    # Monday=0 ... Sunday=6; Wednesday=2
    delta = (2 - d.weekday()) % 7
    return d + timedelta(days=delta)


def _month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def construct_index(session: Session, base_date: date | None = None) -> int:
    settings = get_settings()
    basket = load_psd_basket()
    weights = {(r.origin, r.destination): r.weight for r in basket}
    cells = lowest_economy_cells(session)
    if not cells:
        session.execute(delete(IndexValue))
        session.flush()
        return 0

    dates = sorted({k[2] for k in cells})
    if not dates:
        return 0
    base = base_date or date.fromisoformat(settings.apix_base_date)
    base_window = [d for d in dates if d >= base][:7] or dates[:7]

    # Mean of first-7-day Jevons route prices as base P_i0
    def route_price(origin: str, dest: str, day: date, carry: dict) -> tuple[float | None, float]:
        observed: list[float] = []
        missing = 0
        for lt in LEAD_TIMES:
            val = cells.get((origin, dest, day, lt))
            if val is None:
                val = carry.get((origin, dest, lt))
                if val is None:
                    missing += 1
                    continue
            else:
                carry[(origin, dest, lt)] = val
            observed.append(val)
        price = jevons(observed)
        share = missing / len(LEAD_TIMES)
        return price, share

    carry: dict[tuple[str, str, int], float] = {}
    daily_route: dict[date, dict[tuple[str, str], tuple[float, float]]] = {}
    for day in dates:
        daily_route[day] = {}
        for route in basket:
            price, share = route_price(route.origin, route.destination, day, carry)
            if price is not None:
                daily_route[day][(route.origin, route.destination)] = (price, share)

    base_prices: dict[tuple[str, str], float] = {}
    for route in basket:
        key = (route.origin, route.destination)
        series = [daily_route[d][key][0] for d in base_window if key in daily_route[d]]
        p0 = jevons(series) if series else None
        if p0:
            base_prices[key] = p0

    session.execute(delete(IndexValue))
    session.flush()
    n = 0

    def add(series: str, frequency: str, period: date, value: float, imputed: float,
            origin: str | None = None, destination: str | None = None) -> None:
        nonlocal n
        session.add(
            IndexValue(
                series=series,
                frequency=frequency,
                period_date=period,
                origin=origin,
                destination=destination,
                value=round(value, 4),
                imputed_share=round(imputed, 4),
            )
        )
        n += 1

    daily_national: dict[date, float] = {}
    for day in dates:
        lasp_num = 0.0
        lasp_den = 0.0
        jevons_rels: list[float] = []
        t21_num = 0.0
        t21_den = 0.0
        imputed_w = 0.0
        for route in basket:
            key = (route.origin, route.destination)
            if key not in daily_route[day] or key not in base_prices:
                continue
            price, share = daily_route[day][key]
            rel = price / base_prices[key]
            add(SERIES_ROUTE, "daily", day, 100.0 * rel, share, route.origin, route.destination)
            lasp_num += route.weight * rel
            lasp_den += route.weight
            jevons_rels.append(rel)
            imputed_w += route.weight * share
            t21 = cells.get((route.origin, route.destination, day, 21)) or carry.get(
                (route.origin, route.destination, 21)
            )
            if t21 and key in base_prices:
                # T+21 relative vs same base (route Jevons base). Keep comparable level.
                t21_num += route.weight * (t21 / base_prices[key])
                t21_den += route.weight
        if lasp_den > 0:
            lasp = 100.0 * lasp_num / lasp_den
            daily_national[day] = lasp
            add(SERIES_LASPEYRES, "daily", day, lasp, imputed_w)
        if jevons_rels:
            j = jevons(jevons_rels)
            if j is not None:
                add(SERIES_JEVONS, "daily", day, 100.0 * j, imputed_w)
        if t21_den > 0:
            add(SERIES_T21, "daily", day, 100.0 * t21_num / t21_den, 0.0)

    session.flush()

    def rollup(freq: str, bucket_fn) -> None:
        buckets: dict[date, list[tuple[date, float]]] = defaultdict(list)
        for day, val in daily_national.items():
            buckets[bucket_fn(day)].append((day, val))
        for period, items in sorted(buckets.items()):
            mean = sum(v for _, v in items) / len(items)
            add(SERIES_LASPEYRES, freq, period, mean, 0.0)
        # route-level monthly/weekly
        route_buckets: dict[tuple[date, str, str], list[float]] = defaultdict(list)
        for iv in session.scalars(
            select(IndexValue).where(
                IndexValue.series == SERIES_ROUTE, IndexValue.frequency == "daily"
            )
        ).all():
            if iv.origin and iv.destination:
                route_buckets[(bucket_fn(iv.period_date), iv.origin, iv.destination)].append(iv.value)
        for (period, origin, dest), vals in route_buckets.items():
            add(SERIES_ROUTE, freq, period, sum(vals) / len(vals), 0.0, origin, dest)

    rollup("weekly", _week_ending_wednesday)
    rollup("monthly", _month_start)
    session.flush()
    return n
