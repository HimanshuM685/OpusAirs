from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class IndexPoint(BaseModel):
    series: str
    frequency: str
    period_date: date
    origin: Optional[str] = None
    destination: Optional[str] = None
    value: float
    imputed_share: float = 0.0


class QuoteOut(BaseModel):
    source: str
    origin: str
    destination: str
    carrier: str
    flight_no: str
    dep_date: date
    fare_class: str
    lead_time_days: int
    collected_on: date
    base_fare: float
    taxes: float
    udf: float
    convenience: float
    total_fare: float
    is_outlier: int = 0
    is_imputed: int = 0


class HeatmapCell(BaseModel):
    origin: str
    destination: str
    period_date: date
    lead_time_days: Optional[int] = None
    value: float


class ElasticityPoint(BaseModel):
    origin: Optional[str] = None
    destination: Optional[str] = None
    lead_time_days: int
    mean_total_fare: float


class CollectionHealth(BaseModel):
    source: str
    last_started_at: Optional[datetime] = None
    last_finished_at: Optional[datetime] = None
    status: str
    quotes_ok: int = 0
    quotes_missing: int = 0
    quotes_sold_out: int = 0
    quotes_blocked: int = 0
    notes: str = ""


class BacktestRow(BaseModel):
    month: date
    origin: Optional[str] = None
    destination: Optional[str] = None
    apix_monthly: Optional[float] = None
    apix_mom_pct: Optional[float] = None
    dgca_value: Optional[float] = None
    dgca_mom_pct: Optional[float] = None
    route_avg_fare: Optional[float] = None
    dgca_route_avg: Optional[float] = None


class BacktestSummary(BaseModel):
    correlation: Optional[float] = None
    n_pairs: int = 0
    note: str
    rows: list[BacktestRow] = Field(default_factory=list)


class RouteOut(BaseModel):
    origin: str
    destination: str
    weight: float
    raw_passengers: float
    latest_index: Optional[float] = None
    latest_fare: Optional[float] = None


class QuoteIn(BaseModel):
    source: str = "manual"
    origin: str
    destination: str
    carrier: str
    flight_no: str = "NA"
    dep_date: date
    fare_class: str = "ECONOMY"
    lead_time_days: Optional[int] = None
    collected_on: Optional[date] = None
    base_fare: Optional[float] = None
    taxes: Optional[float] = None
    udf: Optional[float] = None
    convenience: Optional[float] = None
    total_fare: Optional[float] = None
    status: str = "ok"

    @model_validator(mode="after")
    def require_price(self) -> "QuoteIn":
        if self.status in {"ok"} and self.total_fare is None and self.base_fare is None:
            raise ValueError("Provide total_fare or base_fare (or set status to sold_out/missing/blocked)")
        return self


class QuoteBatchIn(BaseModel):
    quotes: list[QuoteIn]
    rebuild_index: bool = True


class IngestResult(BaseModel):
    source: str
    received: int
    inserted: int = 0
    updated: int = 0
    ok: int = 0
    missing: int = 0
    sold_out: int = 0
    blocked: int = 0
    cleaned: int = 0
    index_rows: int = 0
