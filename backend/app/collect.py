from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.cleaning.pipeline import clean_quotes
from app.collectors.amadeus import AmadeusLive
from app.collectors.dgca import DgcaBenchmarkIngest
from app.collectors.fixtures import FixtureIngest
from app.collectors.portals import PlaywrightPortalCollector
from app.collectors.safeguards import CollectionEvent
from app.index.construct import construct_index
from app.ingest import upsert_events
from app.models import CollectionRun


def persist_events(session: Session, source: str, events: list[CollectionEvent]) -> CollectionRun:
    run = CollectionRun(
        started_at=datetime.utcnow(),
        source=source,
        status="running",
    )
    session.add(run)
    session.flush()
    counts = upsert_events(session, source, events, run_id=run.id)
    run.finished_at = datetime.utcnow()
    run.status = "ok"
    run.quotes_ok = counts.get("ok", 0)
    run.quotes_missing = counts.get("missing", 0)
    run.quotes_sold_out = counts.get("sold_out", 0)
    run.quotes_blocked = counts.get("blocked", 0)
    blocked_notes = "; ".join(sorted({e.notes for e in events if e.notes}))[:900]
    run.notes = f"inserted={counts['inserted']} updated={counts['updated']} {blocked_notes}".strip()
    session.flush()
    return run


def run_pipeline(
    session: Session,
    *,
    use_fixtures: bool = True,
    use_scrape: bool = False,
    use_mock: bool = False,
    use_amadeus: bool = True,
    collected_on: date | None = None,
    replace_raw: bool = False,
) -> dict:
    from sqlalchemy import delete

    from app.models import QuoteRaw

    if replace_raw:
        session.execute(delete(QuoteRaw))
        session.flush()

    summary: dict[str, int] = {}
    if use_fixtures:
        events = FixtureIngest().collect(collected_on=None if collected_on is None else collected_on)
        persist_events(session, "fixture", events)
        summary["fixture"] = len(events)
    if use_scrape:
        events = PlaywrightPortalCollector().collect(collected_on=collected_on)
        by_src: dict[str, list[CollectionEvent]] = {}
        for ev in events:
            by_src.setdefault(ev.source, []).append(ev)
        for src, evs in by_src.items():
            persist_events(session, src, evs)
        summary["portals"] = len(events)
    if use_mock:
        from app.collectors.mock_airline import PlaywrightMockAirline

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
    parser.add_argument("--scrape", action="store_true", help="Playwright live airline portals (robots.txt, abort on CAPTCHA)")
    parser.add_argument("--mock", action="store_true", help="Scrape local mock airline (tests only)")
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
            use_scrape=args.scrape,
            use_mock=args.mock,
            collected_on=collected_on if (args.scrape or args.mock) else None,
            replace_raw=not args.no_fixtures and not args.scrape and not args.mock,
        )
        print(result)
    finally:
        session.close()


if __name__ == "__main__":
    main()
