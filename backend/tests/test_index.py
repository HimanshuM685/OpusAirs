from datetime import date, datetime, timedelta

from app.basket import LEAD_TIMES, load_psd_basket, sync_basket
from app.cleaning.pipeline import clean_quotes, split_fare_components
from app.index.construct import construct_index, jevons
from app.models import IndexValue, QuoteRaw


def test_jevons_geometric_mean() -> None:
    assert round(jevons([100, 100, 100]) or 0, 6) == 100
    assert round(jevons([100, 121]) or 0, 6) == 110


def test_split_fare_from_total_only() -> None:
    parts = split_fare_components(
        base_fare=None, taxes=None, udf=None, convenience=None, total_fare=10000
    )
    assert parts is not None
    assert parts["total_fare"] == 10000
    assert abs(parts["base_fare"] + parts["taxes"] + parts["udf"] + parts["convenience"] - 10000) < 0.05


def test_index_base_is_100(session) -> None:
    routes = load_psd_basket()
    sync_basket(session, routes)
    start = date(2026, 8, 1)
    for offset in range(10):
        day = start + timedelta(days=offset)
        for route in routes:
            for lt in LEAD_TIMES:
                session.add(
                    QuoteRaw(
                        source="test",
                        origin=route.origin,
                        destination=route.destination,
                        carrier="6E",
                        flight_no="6E101",
                        dep_date=day + timedelta(days=lt),
                        fare_class="ECONOMY",
                        lead_time_days=lt,
                        collected_on=day,
                        collected_at=datetime.combine(day, datetime.min.time()),
                        status="ok",
                        base_fare=5000,
                        taxes=600,
                        udf=350,
                        convenience=0,
                        total_fare=5950,
                    )
                )
    session.flush()
    clean_quotes(session)
    n = construct_index(session, base_date=start)
    assert n > 0
    daily = [
        r
        for r in session.query(IndexValue).all()
        if r.series == "apix_laspeyres" and r.frequency == "daily"
    ]
    assert daily
    first_week = [r.value for r in daily if r.period_date <= start + timedelta(days=6)]
    assert all(abs(v - 100.0) < 0.05 for v in first_week)


def test_sold_out_excluded(session) -> None:
    sync_basket(session)
    session.add(
        QuoteRaw(
            source="test",
            origin="DEL",
            destination="BOM",
            carrier="6E",
            flight_no="6E1",
            dep_date=date(2026, 8, 2),
            fare_class="ECONOMY",
            lead_time_days=1,
            collected_on=date(2026, 8, 1),
            collected_at=datetime(2026, 8, 1),
            status="sold_out",
            total_fare=None,
        )
    )
    session.flush()
    assert clean_quotes(session) == 0
