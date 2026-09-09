from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import BasketRoute

LEAD_TIMES = (1, 7, 15, 21, 30, 45)
FARE_CLASS = "ECONOMY"
CURRENCY = "INR"

CARRIERS = (
    ("6E", "IndiGo"),
    ("AI", "Air India"),
    ("IX", "Air India Express"),
    ("QP", "Akasa Air"),
    ("SG", "SpiceJet"),
)

# Typical one-way economy base fares (INR) used by the seed generator and mock airline.
ROUTE_BASE_FARES: dict[tuple[str, str], float] = {
    ("DEL", "BOM"): 5200,
    ("DEL", "BLR"): 5800,
    ("BOM", "BLR"): 4300,
    ("DEL", "HYD"): 4900,
    ("DEL", "CCU"): 5400,
    ("DEL", "PNQ"): 4400,
    ("BOM", "MAA"): 4600,
    ("DEL", "AMD"): 3900,
    ("MAA", "DEL"): 5400,
    ("BOM", "HYD"): 4100,
    ("BLR", "HYD"): 3400,
    ("DEL", "GOI"): 5100,
}

LEAD_MULT = {
    1: 1.85,
    7: 1.35,
    15: 1.10,
    21: 1.00,
    30: 0.92,
    45: 0.88,
}


@dataclass(frozen=True)
class RouteSpec:
    origin: str
    destination: str
    raw_passengers: float
    weight: float
    note: str = ""

    @property
    def key(self) -> str:
        return f"{self.origin}-{self.destination}"


def load_psd_basket(path: Path | None = None) -> list[RouteSpec]:
    settings = get_settings()
    csv_path = path or (settings.data_dir / "psd_basket.csv")
    rows: list[tuple[str, str, float, str]] = []
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            rows.append(
                (
                    row["origin"].strip().upper(),
                    row["destination"].strip().upper(),
                    float(row["raw_passengers"]),
                    (row.get("note") or "").strip(),
                )
            )
    total = sum(r[2] for r in rows) or 1.0
    return [
        RouteSpec(origin=o, destination=d, raw_passengers=p, weight=p / total, note=n)
        for o, d, p, n in rows
    ]


def sync_basket(session: Session, routes: list[RouteSpec] | None = None) -> list[BasketRoute]:
    routes = routes or load_psd_basket()
    existing = { (r.origin, r.destination): r for r in session.scalars(select(BasketRoute)).all() }
    out: list[BasketRoute] = []
    for spec in routes:
        rec = existing.get((spec.origin, spec.destination))
        if rec is None:
            rec = BasketRoute(
                origin=spec.origin,
                destination=spec.destination,
                raw_passengers=spec.raw_passengers,
                weight=spec.weight,
                note=spec.note,
            )
            session.add(rec)
        else:
            rec.raw_passengers = spec.raw_passengers
            rec.weight = spec.weight
            rec.note = spec.note
        out.append(rec)
    session.flush()
    return out
