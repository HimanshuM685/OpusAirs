from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BasketRoute(Base):
    __tablename__ = "basket_routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    origin: Mapped[str] = mapped_column(String(3), index=True)
    destination: Mapped[str] = mapped_column(String(3), index=True)
    raw_passengers: Mapped[float] = mapped_column(Float)
    weight: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(500), default="")


class CollectionRun(Base):
    __tablename__ = "collection_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="running")
    quotes_ok: Mapped[int] = mapped_column(Integer, default=0)
    quotes_missing: Mapped[int] = mapped_column(Integer, default=0)
    quotes_sold_out: Mapped[int] = mapped_column(Integer, default=0)
    quotes_blocked: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(String(1000), default="")


class QuoteRaw(Base):
    __tablename__ = "quotes_raw"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "origin",
            "destination",
            "carrier",
            "flight_no",
            "dep_date",
            "fare_class",
            "collected_on",
            "lead_time_days",
            name="uq_quotes_raw_dedupe",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("collection_runs.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    origin: Mapped[str] = mapped_column(String(3), index=True)
    destination: Mapped[str] = mapped_column(String(3), index=True)
    carrier: Mapped[str] = mapped_column(String(8), index=True)
    flight_no: Mapped[str] = mapped_column(String(16))
    dep_date: Mapped[date] = mapped_column(Date, index=True)
    fare_class: Mapped[str] = mapped_column(String(32), default="ECONOMY")
    lead_time_days: Mapped[int] = mapped_column(Integer, index=True)
    collected_on: Mapped[date] = mapped_column(Date, index=True)
    collected_at: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(32), default="ok")
    base_fare: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taxes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    udf: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    convenience: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_fare: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="INR")


class QuoteClean(Base):
    __tablename__ = "quotes_clean"
    __table_args__ = (
        UniqueConstraint(
            "source",
            "origin",
            "destination",
            "carrier",
            "flight_no",
            "dep_date",
            "fare_class",
            "collected_on",
            "lead_time_days",
            name="uq_quotes_clean_dedupe",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    raw_id: Mapped[Optional[int]] = mapped_column(ForeignKey("quotes_raw.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(64), index=True)
    origin: Mapped[str] = mapped_column(String(3), index=True)
    destination: Mapped[str] = mapped_column(String(3), index=True)
    carrier: Mapped[str] = mapped_column(String(8), index=True)
    flight_no: Mapped[str] = mapped_column(String(16))
    dep_date: Mapped[date] = mapped_column(Date, index=True)
    fare_class: Mapped[str] = mapped_column(String(32), default="ECONOMY")
    lead_time_days: Mapped[int] = mapped_column(Integer, index=True)
    collected_on: Mapped[date] = mapped_column(Date, index=True)
    base_fare: Mapped[float] = mapped_column(Float)
    taxes: Mapped[float] = mapped_column(Float)
    udf: Mapped[float] = mapped_column(Float)
    convenience: Mapped[float] = mapped_column(Float)
    total_fare: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    is_outlier: Mapped[int] = mapped_column(Integer, default=0)
    is_imputed: Mapped[int] = mapped_column(Integer, default=0)


class IndexValue(Base):
    __tablename__ = "index_values"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    series: Mapped[str] = mapped_column(String(64), index=True)
    frequency: Mapped[str] = mapped_column(String(16), index=True)
    period_date: Mapped[date] = mapped_column(Date, index=True)
    origin: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    value: Mapped[float] = mapped_column(Float)
    imputed_share: Mapped[float] = mapped_column(Float, default=0.0)


class DgcaBenchmark(Base):
    __tablename__ = "dgca_benchmark"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    month: Mapped[date] = mapped_column(Date, index=True)
    origin: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    destination: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)
    metric: Mapped[str] = mapped_column(String(64))
    value: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(500), default="")
