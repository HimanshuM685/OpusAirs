from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DgcaBenchmark, IndexValue, QuoteClean
from app.schemas import BacktestRow, BacktestSummary


def _mom(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous == 0:
        return None
    return round(100.0 * (current - previous) / previous, 2)


def _corr(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs) ** 0.5
    dy = sum((y - my) ** 2 for y in ys) ** 0.5
    if dx == 0 or dy == 0:
        return None
    return round(num / (dx * dy), 4)


def compute_backtest(session: Session) -> BacktestSummary:
    apix = session.scalars(
        select(IndexValue).where(
            IndexValue.series == "apix_laspeyres",
            IndexValue.frequency == "monthly",
            IndexValue.origin.is_(None),
        )
    ).all()
    apix_by_month = {r.period_date: r.value for r in apix}

    tmu = session.scalars(
        select(DgcaBenchmark).where(DgcaBenchmark.metric == "tmu_basket_index")
    ).all()
    tmu_by_month = {r.month: r.value for r in tmu}

    route_apix_avg: dict[tuple[date, str, str], list[float]] = defaultdict(list)
    quotes = session.scalars(select(QuoteClean).where(QuoteClean.is_outlier == 0)).all()
    for q in quotes:
        month = date(q.collected_on.year, q.collected_on.month, 1)
        route_apix_avg[(month, q.origin, q.destination)].append(q.total_fare)

    dgca_route = session.scalars(
        select(DgcaBenchmark).where(DgcaBenchmark.metric == "tmu_route_avg_fare")
    ).all()
    dgca_route_map = {(r.month, r.origin, r.destination): r.value for r in dgca_route}

    months = sorted(set(apix_by_month) | set(tmu_by_month))
    rows: list[BacktestRow] = []
    prev_apix = None
    prev_tmu = None
    xs: list[float] = []
    ys: list[float] = []
    for month in months:
        a = apix_by_month.get(month)
        t = tmu_by_month.get(month)
        rows.append(
            BacktestRow(
                month=month,
                apix_monthly=a,
                apix_mom_pct=_mom(a, prev_apix) if a is not None else None,
                dgca_value=t,
                dgca_mom_pct=_mom(t, prev_tmu) if t is not None else None,
            )
        )
        if a is not None:
            prev_apix = a
        if t is not None:
            prev_tmu = t
        if a is not None and t is not None:
            xs.append(a)
            ys.append(t)

    for (month, origin, dest), fares in sorted(route_apix_avg.items()):
        dg = dgca_route_map.get((month, origin, dest))
        avg = sum(fares) / len(fares)
        rows.append(
            BacktestRow(
                month=month,
                origin=origin,
                destination=dest,
                route_avg_fare=round(avg, 2),
                dgca_route_avg=dg,
            )
        )
        if dg is not None:
            xs.append(avg)
            ys.append(dg)

    published = session.scalars(
        select(DgcaBenchmark).where(DgcaBenchmark.metric == "tmu_72_route_index")
    ).all()
    for r in published:
        rows.append(
            BacktestRow(
                month=r.month,
                dgca_value=r.value,
            )
        )

    return BacktestSummary(
        correlation=_corr(
            [row.apix_monthly for row in rows if row.apix_monthly is not None and row.dgca_value is not None and row.origin is None],
            [row.dgca_value for row in rows if row.apix_monthly is not None and row.dgca_value is not None and row.origin is None],
        ),
        n_pairs=sum(
            1
            for row in rows
            if row.origin is None and row.apix_monthly is not None and row.dgca_value is not None
        ),
        note=(
            "Monthly APIx (Laspeyres, lowest-economy Jevons elementary) vs TMU-style mean fares "
            "on the same reconstructed sample, plus published 72-route TMU composite (+20.5% Jun 2026 vs Mar 2025). "
            "DGCA does not publish a public daily route-level fare dump; overlapping months are the validation set."
        ),
        rows=rows,
    )
