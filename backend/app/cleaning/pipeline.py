from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import date, datetime
from typing import Iterable

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import QuoteClean, QuoteRaw


def _parse_amount(value: float | int | str | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if math.isnan(float(value)):
            return None
        return float(value)
    text = str(value).replace(",", "").replace("₹", "").replace("INR", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def split_fare_components(
    *,
    base_fare: float | None,
    taxes: float | None,
    udf: float | None,
    convenience: float | None,
    total_fare: float | None,
) -> dict[str, float] | None:
    total = _parse_amount(total_fare)
    base = _parse_amount(base_fare)
    tax = _parse_amount(taxes) or 0.0
    u = _parse_amount(udf) or 0.0
    conv = _parse_amount(convenience) or 0.0
    if total is None and base is None:
        return None
    if base is None and total is not None:
        # Typical India domestic split when only total is observed.
        tax = round(total * 0.12, 2)
        u = round(total * 0.04, 2)
        conv = round(total * 0.02, 2)
        base = round(total - tax - u - conv, 2)
    elif total is None and base is not None:
        total = round(base + tax + u + conv, 2)
    else:
        reconstructed = round((base or 0) + tax + u + conv, 2)
        if abs(reconstructed - (total or 0)) > 5:
            total = reconstructed
    if total is None or total <= 0 or (base or 0) <= 0:
        return None
    return {
        "base_fare": float(base),
        "taxes": float(tax),
        "udf": float(u),
        "convenience": float(conv),
        "total_fare": float(total),
    }


def _mad_flags(values: list[float], cutoff: float = 3.5) -> list[bool]:
    if len(values) < 4:
        return [False] * len(values)
    med = statistics.median(values)
    abs_dev = [abs(v - med) for v in values]
    mad = statistics.median(abs_dev)
    if mad == 0:
        q1, q3 = statistics.quantiles(values, n=4)[0], statistics.quantiles(values, n=4)[2]
        iqr = q3 - q1
        if iqr == 0:
            return [False] * len(values)
        return [v < q1 - 1.5 * iqr or v > q3 + 1.5 * iqr for v in values]
    return [abs(v - med) / (1.4826 * mad) > cutoff for v in values]


def clean_quotes(session: Session, raw_rows: Iterable[QuoteRaw] | None = None) -> int:
    if raw_rows is None:
        raw_rows = session.scalars(select(QuoteRaw)).all()
    else:
        raw_rows = list(raw_rows)

    session.execute(delete(QuoteClean))
    session.flush()

    grouped: dict[tuple[str, str, int], list[tuple[QuoteRaw, dict[str, float]]]] = defaultdict(list)
    for raw in raw_rows:
        if raw.status in {"sold_out", "cancelled", "blocked", "missing"}:
            continue
        parts = split_fare_components(
            base_fare=raw.base_fare,
            taxes=raw.taxes,
            udf=raw.udf,
            convenience=raw.convenience,
            total_fare=raw.total_fare,
        )
        if parts is None:
            continue
        grouped[(raw.origin, raw.destination, raw.lead_time_days)].append((raw, parts))

    written = 0
    seen: set[tuple] = set()
    for key, items in grouped.items():
        totals = [p["total_fare"] for _, p in items]
        flags = _mad_flags(totals)
        for (raw, parts), outlier in zip(items, flags):
            dedupe = (
                raw.source,
                raw.origin,
                raw.destination,
                raw.carrier,
                raw.flight_no,
                raw.dep_date,
                raw.fare_class,
                raw.collected_on,
                raw.lead_time_days,
            )
            if dedupe in seen:
                continue
            seen.add(dedupe)
            session.add(
                QuoteClean(
                    raw_id=raw.id,
                    source=raw.source,
                    origin=raw.origin,
                    destination=raw.destination,
                    carrier=raw.carrier,
                    flight_no=raw.flight_no,
                    dep_date=raw.dep_date,
                    fare_class=raw.fare_class,
                    lead_time_days=raw.lead_time_days,
                    collected_on=raw.collected_on,
                    **parts,
                    is_outlier=1 if outlier else 0,
                    is_imputed=0,
                )
            )
            written += 1
    session.flush()
    return written


def lowest_economy_cells(session: Session) -> dict[tuple[str, str, date, int], float]:
    """Lowest non-outlier economy total by route × collected_on × lead time."""
    cells: dict[tuple[str, str, date, int], float] = {}
    rows = session.scalars(select(QuoteClean).where(QuoteClean.is_outlier == 0)).all()
    for q in rows:
        key = (q.origin, q.destination, q.collected_on, q.lead_time_days)
        prev = cells.get(key)
        if prev is None or q.total_fare < prev:
            cells[key] = q.total_fare
    return cells
