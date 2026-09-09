from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cleaning.pipeline import clean_quotes
from app.collectors.amadeus import AmadeusLive
from app.collectors.dgca import DgcaBenchmarkIngest
from app.collectors.fixtures import FixtureIngest
from app.collectors.mock_airline import PlaywrightMockAirline
from app.collectors.safeguards import CollectionEvent
from app.index.construct import construct_index
from app.models import CollectionRun, QuoteRaw


def _raw_key(source: str, origin: str, dest: str, carrier: str, flight_no: str, dep, fare_class: str, collected_on, lead: int) -> tuple:
    return (source, origin, dest, carrier, flight_no, dep, fare_class, collected_on, lead)


def persist_events(session: Session, source: str, events: list[CollectionEvent]) -> CollectionRun:
    run = CollectionRun(
        started_at=datetime.utcnow(),
        source=source,
        status="running",
    )
    session.add(run)
    session.flush()
    existing = {
        _raw_key(
            q.source, q.origin, q.destination, q.carrier, q.flight_no,
            q.dep_date, q.fare_class, q.collected_on, q.lead_time_days,
        )
        for q in session.scalars(select(QuoteRaw)).all()
    }
    counts = {"ok": 0, "missing": 0, "sold_out": 0, "blocked": 0, "cancelled": 0}
    for ev in events:
        counts[ev.status] = counts.get(ev.status, 0) + 1
        carrier = ev.carrier or "NA"
        flight_no = ev.flight_no or "NA"
        key = _raw_key(
            ev.source, ev.origin, ev.destination, carrier, flight_no,
            ev.dep_date, ev.fare_class, ev.collected_on, ev.lead_time_days,
        )
        if key in existing:
            continue
        existing.add(key)
        session.add(
            QuoteRaw(
                run_id=run.id,
                source=ev.source,
                origin=ev.origin,
                destination=ev.destination,
                carrier=carrier,
                flight_no=flight_no,
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
    run.finished_at = datetime.utcnow()
    run.status = "ok"
    run.quotes_ok = counts.get("ok", 0)
    run.quotes_missing = counts.get("missing", 0)
    run.quotes_sold_out = counts.get("sold_out", 0)
    run.quotes_blocked = counts.get("blocked", 0)
    run.notes = f"cancelled={counts.get('cancelled', 0)}"
    session.flush()
    return run


def run_pipeline(
    session: Session,
    *,
    use_fixtures: bool = True,
    use_mock: bool = False,
    use_amadeus: bool = True,
    collected_on: date | None = None,
    replace_raw: bool = False,
) -> dict:
    from sqlalchemy import delete

    if replace_raw:
        session.execute(delete(QuoteRaw))
        session.flush()

    summary: dict[str, int] = {}
    if use_fixtures:
        events = FixtureIngest().collect(collected_on=None if collected_on is None else collected_on)
        persist_events(session, "fixture", events)
        summary["fixture"] = len(events)
    if use_mock:
        events = PlaywrightMockAirline().collect(collected_on=collected_on)
        persist_events(session, "mock_airline", events)
        summary["mock_airline"] = len(events)
    if use_amadeus:
        events = AmadeusLive().collect(collected_on=collected_on)
        persist_events(session, "amadeus", events)
        summary["amadeus"] = len(events)

    DgcaBenchmarkIngest().load(session)
    cleaned = clean_quotes(session)
    indexed = construct_index(session)
    session.commit()
    return {"collected": summary, "cleaned": cleaned, "index_rows": indexed}


def main() -> None:
    import argparse

    from app.bootstrap import bootstrap
    from app.db import get_session_factory, init_db

    parser = argparse.ArgumentParser(description="Run OpusAirs collection + index pipeline")
    parser.add_argument("--mock", action="store_true", help="Scrape local mock airline with Playwright")
    parser.add_argument("--no-fixtures", action="store_true")
    parser.add_argument("--date", type=str, default=None, help="collected_on YYYY-MM-DD")
    args = parser.parse_args()
    init_db()
    bootstrap()
    collected_on = date.fromisoformat(args.date) if args.date else date.today()
    session = get_session_factory()()
    try:
        result = run_pipeline(
            session,
            use_fixtures=not args.no_fixtures,
            use_mock=args.mock,
            collected_on=collected_on if args.mock else None,
            replace_raw=not args.no_fixtures and not args.mock,
        )
        print(result)
    finally:
        session.close()


if __name__ == "__main__":
    main()
