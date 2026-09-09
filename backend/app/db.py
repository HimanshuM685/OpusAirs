from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
SessionLocal: sessionmaker | None = None


def sqlalchemy_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    if "neon.tech" in url and "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def get_engine() -> Engine:
    global _engine, SessionLocal
    if _engine is None:
        settings = get_settings()
        url = sqlalchemy_url(settings.database_url)
        kwargs: dict = {"connect_args": _connect_args(url)}
        if url.startswith("postgresql"):
            kwargs.update(pool_pre_ping=True, pool_recycle=300, pool_size=5, max_overflow=2)
        _engine = create_engine(url, **kwargs)
        SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def reset_engine() -> None:
    global _engine, SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    SessionLocal = None


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=get_engine())


def get_session_factory() -> sessionmaker:
    get_engine()
    assert SessionLocal is not None
    return SessionLocal


def get_session() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()
