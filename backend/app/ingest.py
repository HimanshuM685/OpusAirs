from __future__ import annotations

import csv
import io
from datetime import date, datetime
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.basket import FARE_CLASS
from app.cleaning.pipeline import clean_quotes
from app.collectors.safeguards import CollectionEvent
from app.index.construct import construct_index
from app.models import QuoteRaw
from app.schemas import QuoteIn


def quote_in_to_event(q: QuoteIn) -> CollectionEvent:
    collected_on = q.collected_on or date.today()
    lead = q.lead_time_days
    if lead is None:
        lead = (q.dep_date - collected_on).days
    return CollectionEvent(
        source=(q.source or "manual").strip() or "manual",
        origin=q.origin.strip().upper(),
        destination=q.destination.strip().upper(),
        carrier=q.carrier.strip().upper(),
        flight_no=(q.flight_no or "NA").strip() or "NA",
        dep_date=q.dep_date,
        fare_class=(q.fare_class or FARE_CLASS).strip() or FARE_CLASS,
        lead_time_days=int(lead),
        collected_on=collected_on,
        collected_at=datetime.utcnow(),
        status=(q.status or "ok").strip() or "ok",
        base_fare=q.base_fare,
        taxes=q.taxes,
        udf=q.udf,
        convenience=q.convenience,
        total_fare=q.total_fare,
    )


def _raw_match(session: Session, ev: CollectionEvent) -> QuoteRaw | None:
    return session.scalars(
        select(QuoteRaw).where(
            QuoteRaw.source == ev.source,
            QuoteRaw.origin == ev.origin,
            QuoteRaw.destination == ev.destination,
            QuoteRaw.carrier == ev.carrier,
            QuoteRaw.flight_no == ev.flight_no,
            QuoteRaw.dep_date == ev.dep_date,
            QuoteRaw.fare_class == ev.fare_class,
            QuoteRaw.collected_on == ev.collected_on,
            QuoteRaw.lead_time_days == ev.lead_time_days,
        )
    ).first()


def upsert_events(session: Session, source: str, events: list[CollectionEvent], run_id: int | None = None) -> dict[str, int]:
    counts = {"inserted": 0, "updated": 0, "ok": 0, "missing": 0, "sold_out": 0, "blocked": 0, "cancelled": 0}
    for ev in events:
        counts[ev.status] = counts.get(ev.status, 0) + 1
        existing = _raw_match(session, ev)
        if existing is None:
            session.add(
                QuoteRaw(
                    run_id=run_id,
                    source=ev.source,
                    origin=ev.origin,
                    destination=ev.destination,
                    carrier=ev.carrier or "NA",
                    flight_no=ev.flight_no or "NA",
                    dep_date=ev.dep_date,
                    fare_class=ev.fare_class,
                    lead_time_days=ev.lead_time_days,
                    collected_on=ev.collected_on,
                    collected_at=ev.collected_at,
                    status=ev.status,
                    base_fare=ev.base_fare,
                    taxes=ev.taxes,
                    udf=ev.udf,
                    convenience=ev.convenience,
                    total_fare=ev.total_fare,
                )
            )
            counts["inserted"] += 1
        else:
            existing.status = ev.status
            existing.base_fare = ev.base_fare
            existing.taxes = ev.taxes
            existing.udf = ev.udf
            existing.convenience = ev.convenience
            existing.total_fare = ev.total_fare
            existing.collected_at = ev.collected_at
            if run_id is not None:
                existing.run_id = run_id
            counts["updated"] += 1
    session.flush()
    return counts


def ingest_quotes(session: Session, quotes: Iterable[QuoteIn], *, rebuild_index: bool = True) -> dict:
    from datetime import datetime as dt

    from app.models import CollectionRun

    events = [quote_in_to_event(q) for q in quotes]
    run = CollectionRun(
        started_at=dt.utcnow(),
        source="manual",
        status="running",
    )
    session.add(run)
    session.flush()
    counts = upsert_events(session, "manual", events, run_id=run.id)
    run.finished_at = dt.utcnow()
    run.status = "ok"
    run.quotes_ok = counts.get("ok", 0)
    run.quotes_missing = counts.get("missing", 0)
    run.quotes_sold_out = counts.get("sold_out", 0)
    run.quotes_blocked = counts.get("blocked", 0)
    run.notes = f"inserted={counts['inserted']} updated={counts['updated']}"
    cleaned = 0
    indexed = 0
    if rebuild_index:
        cleaned = clean_quotes(session)
        indexed = construct_index(session)
    session.commit()
    return {
        "source": "manual",
        "received": len(events),
        **counts,
        "cleaned": cleaned,
        "index_rows": indexed,
    }


def _cell(row: dict, *names: str) -> str:
    lower = {k.strip().lower(): v for k, v in row.items() if k}
    for name in names:
        if name in lower and lower[name] not in (None, ""):
            return str(lower[name]).strip()
    return ""


def _opt_float(text: str) -> float | None:
    if text is None or str(text).strip() == "":
        return None
    return float(str(text).replace(",", "").replace("₹", "").strip())


def parse_csv_quotes(text: str) -> list[QuoteIn]:
    reader = csv.DictReader(io.StringIO(text))
    out: list[QuoteIn] = []
    for row in reader:
        origin = _cell(row, "origin", "from").upper()
        dest = _cell(row, "destination", "dest", "to").upper()
        if not origin or not dest:
            continue
        collected = _cell(row, "collected_on", "collected", "quote_date") or date.today().isoformat()
        dep = _cell(row, "dep_date", "departure", "travel_date")
        if not dep:
            continue
        lead_raw = _cell(row, "lead_time_days", "lead_time", "tplus")
        payload = {
            "source": _cell(row, "source") or "manual",
            "origin": origin,
            "destination": dest,
            "carrier": (_cell(row, "carrier", "airline") or "NA").upper(),
            "flight_no": _cell(row, "flight_no", "flight") or "NA",
            "dep_date": dep,
            "fare_class": _cell(row, "fare_class", "cabin") or FARE_CLASS,
            "collected_on": collected,
            "base_fare": _opt_float(_cell(row, "base_fare", "base")),
            "taxes": _opt_float(_cell(row, "taxes", "tax")),
            "udf": _opt_float(_cell(row, "udf")),
            "convenience": _opt_float(_cell(row, "convenience", "conv_fee")),
            "total_fare": _opt_float(_cell(row, "total_fare", "total", "fare")),
            "status": _cell(row, "status") or "ok",
        }
        if lead_raw:
            payload["lead_time_days"] = int(float(lead_raw))
        out.append(QuoteIn.model_validate(payload))
    return out
