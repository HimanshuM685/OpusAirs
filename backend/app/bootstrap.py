from __future__ import annotations

from app.basket import sync_basket
from app.collect import run_pipeline
from app.config import get_settings
from app.db import get_session_factory, init_db
from app.models import QuoteRaw
from app.seed import write_seed_files


def _apply_manual_csv(session) -> dict | None:
    from app.ingest import ingest_quotes, parse_csv_quotes

    settings = get_settings()
    path = settings.data_dir / "quotes_manual.csv"
    if not path.exists():
        return None
    quotes = parse_csv_quotes(path.read_text(encoding="utf-8-sig"))
    if not quotes:
        return None
    return ingest_quotes(session, quotes, rebuild_index=True)


def bootstrap(force_seed: bool = False) -> dict:
    init_db()
    settings = get_settings()
    jsonl = settings.data_dir / "quotes_seed.jsonl"
    if force_seed or not jsonl.exists():
        write_seed_files()
    session = get_session_factory()()
    try:
        sync_basket(session)
        session.commit()
        has_quotes = session.query(QuoteRaw).first() is not None
        result: dict
        if has_quotes:
            result = {"status": "ready", "seeded": False}
        else:
            seeded = run_pipeline(session, use_fixtures=True, use_scrape=False, use_mock=False, replace_raw=True)
            result = {"status": "seeded", **seeded}
        manual = _apply_manual_csv(session)
        if manual:
            result["manual_csv"] = manual
        return result
    finally:
        session.close()
