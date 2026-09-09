from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.bootstrap import bootstrap
from app.config import get_settings
from app.db import get_session_factory, init_db


def _start_scheduler() -> None:
    settings = get_settings()
    if not settings.collect_enabled:
        return
    from apscheduler.schedulers.background import BackgroundScheduler

    def job() -> None:
        from datetime import date

        from app.collect import run_pipeline

        session = get_session_factory()()
        try:
            run_pipeline(
                session,
                use_fixtures=False,
                use_mock=True,
                collected_on=date.today(),
                replace_raw=False,
            )
        except Exception:
            session.rollback()
        finally:
            session.close()

    scheduler = BackgroundScheduler()
    scheduler.add_job(job, "cron", hour=2, minute=30, id="daily_collect")
    scheduler.start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if os.getenv("OPUSAIRS_SKIP_BOOTSTRAP") != "1":
        bootstrap()
        _start_scheduler()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="OpusAirs APIx",
        description="Real-time Airfare Price Index API for NSO / RBI (SIH26056)",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(v1_router)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "service": "opusairs-apix"}

    return app


app = create_app()
