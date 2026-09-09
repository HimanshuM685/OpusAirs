from __future__ import annotations

import os
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session, init_db, reset_engine


@pytest.fixture
def tmp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    db = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db}")
    monkeypatch.setenv("OPUSAIRS_SKIP_BOOTSTRAP", "1")
    get_settings.cache_clear()
    reset_engine()
    init_db()
    yield
    reset_engine()
    get_settings.cache_clear()
    os.environ.pop("DATABASE_URL", None)


@pytest.fixture
def session(tmp_db: None) -> Generator[Session, None, None]:
    gen = get_session()
    sess = next(gen)
    try:
        yield sess
    finally:
        try:
            next(gen)
        except StopIteration:
            pass
