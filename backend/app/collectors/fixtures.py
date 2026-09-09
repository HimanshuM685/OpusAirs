from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from app.collectors.safeguards import CollectionEvent
from app.config import get_settings


class FixtureIngest:
    name = "fixture"

    def __init__(self, path: Path | None = None) -> None:
        settings = get_settings()
        self.path = path or (settings.data_dir / "quotes_seed.jsonl")

    def collect(self, collected_on: date | None = None) -> list[CollectionEvent]:
        if not self.path.exists():
            return []
        events: list[CollectionEvent] = []
        with self.path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                row_date = date.fromisoformat(row["collected_on"])
                if collected_on is not None and row_date != collected_on:
                    continue
                events.append(
                    CollectionEvent(
                        source=row.get("source", self.name),
                        origin=row["origin"],
                        destination=row["destination"],
                        carrier=row["carrier"],
                        flight_no=row["flight_no"],
                        dep_date=date.fromisoformat(row["dep_date"]),
                        fare_class=row.get("fare_class", "ECONOMY"),
                        lead_time_days=int(row["lead_time_days"]),
                        collected_on=row_date,
                        collected_at=datetime.fromisoformat(row.get("collected_at", f"{row['collected_on']}T00:00:00")),
                        status=row.get("status", "ok"),
                        base_fare=row.get("base_fare"),
                        taxes=row.get("taxes"),
                        udf=row.get("udf"),
                        convenience=row.get("convenience"),
                        total_fare=row.get("total_fare"),
                    )
                )
        return events
