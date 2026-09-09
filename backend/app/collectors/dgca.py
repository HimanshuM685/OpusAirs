from __future__ import annotations

import csv
from datetime import date

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import DgcaBenchmark


class DgcaBenchmarkIngest:
    name = "dgca"

    def __init__(self) -> None:
        self.path = get_settings().data_dir / "dgca_benchmark.csv"

    def collect(self, collected_on: date | None = None) -> list:
        return []

    def load(self, session: Session) -> int:
        if not self.path.exists():
            return 0
        session.execute(delete(DgcaBenchmark))
        n = 0
        with self.path.open(newline="", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                origin = (row.get("origin") or "").strip() or None
                dest = (row.get("destination") or "").strip() or None
                session.add(
                    DgcaBenchmark(
                        month=date.fromisoformat(row["month"]),
                        origin=origin,
                        destination=dest,
                        metric=row["metric"],
                        value=float(row["value"]),
                        note=row.get("note") or "",
                    )
                )
                n += 1
        session.flush()
        return n
