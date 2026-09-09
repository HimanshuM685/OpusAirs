from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import BasketRoute, CollectionRun, IndexValue, QuoteClean
from app.schemas import (
    BacktestSummary,
    CollectionHealth,
    ElasticityPoint,
    HeatmapCell,
    IndexPoint,
    IngestResult,
    QuoteBatchIn,
    QuoteOut,
    RouteOut,
)
from app.services.backtest import compute_backtest

router = APIRouter(prefix="/v1")


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> str:
    from app.config import get_settings

    expected = get_settings().api_key
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")
    return x_api_key


@router.get("/index", response_model=list[IndexPoint])
def get_index(
    frequency: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    series: str = Query("apix_laspeyres"),
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[IndexPoint]:
    rows = session.scalars(
        select(IndexValue)
        .where(
            IndexValue.frequency == frequency,
            IndexValue.series == series,
            IndexValue.origin.is_(None),
        )
        .order_by(IndexValue.period_date)
    ).all()
    return [IndexPoint.model_validate(r, from_attributes=True) for r in rows]


@router.get("/index/routes/{origin}/{dest}", response_model=list[IndexPoint])
def get_route_index(
    origin: str,
    dest: str,
    frequency: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[IndexPoint]:
    rows = session.scalars(
        select(IndexValue)
        .where(
            IndexValue.frequency == frequency,
            IndexValue.series == "apix_route",
            IndexValue.origin == origin.upper(),
            IndexValue.destination == dest.upper(),
        )
        .order_by(IndexValue.period_date)
    ).all()
    return [IndexPoint.model_validate(r, from_attributes=True) for r in rows]


@router.get("/quotes", response_model=list[QuoteOut])
def get_quotes(
    origin: Optional[str] = None,
    dest: Optional[str] = None,
    carrier: Optional[str] = None,
    lead_time: Optional[int] = None,
    collected_on: Optional[date] = None,
    limit: int = Query(200, le=2000),
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[QuoteOut]:
    stmt = select(QuoteClean)
    if origin:
        stmt = stmt.where(QuoteClean.origin == origin.upper())
    if dest:
        stmt = stmt.where(QuoteClean.destination == dest.upper())
    if carrier:
        stmt = stmt.where(QuoteClean.carrier == carrier.upper())
    if lead_time is not None:
        stmt = stmt.where(QuoteClean.lead_time_days == lead_time)
    if collected_on:
        stmt = stmt.where(QuoteClean.collected_on == collected_on)
    stmt = stmt.order_by(QuoteClean.collected_on.desc()).limit(limit)
    rows = session.scalars(stmt).all()
    return [QuoteOut.model_validate(r, from_attributes=True) for r in rows]


@router.get("/heatmap", response_model=list[HeatmapCell])
def get_heatmap(
    lead_time: Optional[int] = None,
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[HeatmapCell]:
    if lead_time is None:
        rows = session.scalars(
            select(IndexValue).where(
                IndexValue.series == "apix_route",
                IndexValue.frequency == "daily",
            )
        ).all()
        return [
            HeatmapCell(
                origin=r.origin or "",
                destination=r.destination or "",
                period_date=r.period_date,
                value=r.value,
            )
            for r in rows
            if r.origin and r.destination
        ]
    rows = session.scalars(select(QuoteClean).where(QuoteClean.is_outlier == 0)).all()
    cells: dict[tuple[str, str, date], list[float]] = {}
    for q in rows:
        if q.lead_time_days != lead_time:
            continue
        key = (q.origin, q.destination, q.collected_on)
        cells.setdefault(key, []).append(q.total_fare)
    return [
        HeatmapCell(
            origin=o,
            destination=d,
            period_date=day,
            lead_time_days=lead_time,
            value=round(min(vals), 2),
        )
        for (o, d, day), vals in sorted(cells.items())
    ]


@router.get("/elasticity", response_model=list[ElasticityPoint])
def get_elasticity(
    origin: Optional[str] = None,
    dest: Optional[str] = None,
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[ElasticityPoint]:
    stmt = select(QuoteClean).where(QuoteClean.is_outlier == 0)
    if origin:
        stmt = stmt.where(QuoteClean.origin == origin.upper())
    if dest:
        stmt = stmt.where(QuoteClean.destination == dest.upper())
    rows = session.scalars(stmt).all()
    buckets: dict[tuple[Optional[str], Optional[str], int], list[float]] = {}
    for q in rows:
        key = (
            q.origin if origin else None,
            q.destination if dest else None,
            q.lead_time_days,
        )
        buckets.setdefault(key, []).append(q.total_fare)
    return [
        ElasticityPoint(
            origin=o,
            destination=d,
            lead_time_days=lt,
            mean_total_fare=round(sum(vals) / len(vals), 2),
        )
        for (o, d, lt), vals in sorted(buckets.items(), key=lambda x: x[0][2])
    ]


@router.get("/health/collection", response_model=list[CollectionHealth])
def collection_health(
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[CollectionHealth]:
    rows = session.scalars(select(CollectionRun).order_by(CollectionRun.started_at.desc())).all()
    latest: dict[str, CollectionRun] = {}
    for r in rows:
        if r.source not in latest:
            latest[r.source] = r
    return [
        CollectionHealth(
            source=r.source,
            last_started_at=r.started_at,
            last_finished_at=r.finished_at,
            status=r.status,
            quotes_ok=r.quotes_ok,
            quotes_missing=r.quotes_missing,
            quotes_sold_out=r.quotes_sold_out,
            quotes_blocked=r.quotes_blocked,
            notes=r.notes,
        )
        for r in latest.values()
    ]


@router.get("/routes", response_model=list[RouteOut])
def list_routes(
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> list[RouteOut]:
    routes = session.scalars(select(BasketRoute)).all()
    out: list[RouteOut] = []
    for r in routes:
        latest = session.scalars(
            select(IndexValue)
            .where(
                IndexValue.series == "apix_route",
                IndexValue.frequency == "daily",
                IndexValue.origin == r.origin,
                IndexValue.destination == r.destination,
            )
            .order_by(IndexValue.period_date.desc())
        ).first()
        fare_row = session.scalars(
            select(QuoteClean)
            .where(
                QuoteClean.origin == r.origin,
                QuoteClean.destination == r.destination,
                QuoteClean.is_outlier == 0,
            )
            .order_by(QuoteClean.collected_on.desc())
        ).first()
        out.append(
            RouteOut(
                origin=r.origin,
                destination=r.destination,
                weight=r.weight,
                raw_passengers=r.raw_passengers,
                latest_index=latest.value if latest else None,
                latest_fare=fare_row.total_fare if fare_row else None,
            )
        )
    return out


@router.get("/backtest/dgca", response_model=BacktestSummary)
def backtest_dgca(
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> BacktestSummary:
    return compute_backtest(session)


@router.post("/collect/run")
def trigger_collect(
    scrape: bool = True,
    mock: bool = False,
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> dict:
    from app.collect import run_pipeline

    return run_pipeline(
        session,
        use_fixtures=False,
        use_scrape=scrape,
        use_mock=mock,
        replace_raw=False,
    )


@router.post("/ingest/quotes", response_model=IngestResult)
def ingest_quotes_json(
    batch: QuoteBatchIn,
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> dict:
    from app.ingest import ingest_quotes

    if not batch.quotes:
        raise HTTPException(status_code=400, detail="quotes array is empty")
    return ingest_quotes(session, batch.quotes, rebuild_index=batch.rebuild_index)


@router.post("/ingest/csv", response_model=IngestResult)
async def ingest_quotes_csv(
    file: UploadFile = File(...),
    rebuild_index: bool = True,
    session: Session = Depends(get_session),
    _: str = Depends(require_api_key),
) -> dict:
    from app.ingest import ingest_quotes, parse_csv_quotes

    raw = (await file.read()).decode("utf-8-sig")
    quotes = parse_csv_quotes(raw)
    if not quotes:
        raise HTTPException(status_code=400, detail="No valid quote rows in CSV")
    return ingest_quotes(session, quotes, rebuild_index=rebuild_index)


@router.get("/ingest/template")
def ingest_template(_: str = Depends(require_api_key)):
    from fastapi.responses import PlainTextResponse

    from app.config import get_settings

    path = get_settings().data_dir / "quotes_manual.example.csv"
    return PlainTextResponse(path.read_text(encoding="utf-8"), media_type="text/csv")
