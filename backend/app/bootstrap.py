from __future__ import annotations

from app.basket import sync_basket
from app.collect import run_pipeline
from app.config import get_settings
from app.db import get_session_factory, init_db
from app.models import QuoteRaw
from app.seed import write_seed_files


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
        if has_quotes:
            return {"status": "ready", "seeded": False}
        result = run_pipeline(session, use_fixtures=True, use_mock=False, replace_raw=True)
        return {"status": "seeded", **result}
    finally:
        session.close()
