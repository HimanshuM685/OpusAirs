from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from app.basket import LEAD_TIMES, load_psd_basket, sync_basket
from app.cleaning.pipeline import clean_quotes
from app.config import get_settings
from app.index.construct import construct_index
from app.main import create_app
from app.models import QuoteRaw


def _seed_tiny(session) -> None:
    routes = load_psd_basket()[:3]
    sync_basket(session, load_psd_basket())
    start = date(2026, 8, 1)
    for offset in range(8):
        day = start + timedelta(days=offset)
        for route in routes:
            for lt in LEAD_TIMES:
                session.add(
                    QuoteRaw(
                        source="test",
                        origin=route.origin,
                        destination=route.destination,
                        carrier="6E",
                        flight_no="6E200",
                        dep_date=day + timedelta(days=lt),
                        fare_class="ECONOMY",
                        lead_time_days=lt,
                        collected_on=day,
                        collected_at=datetime.combine(day, datetime.min.time()),
                        status="ok",
                        base_fare=4000 + offset * 10,
                        taxes=480,
                        udf=350,
                        convenience=0,
                        total_fare=4830 + offset * 10,
                    )
                )
    session.flush()
    clean_quotes(session)
    construct_index(session, base_date=start)
    session.commit()


def test_api_requires_key(session) -> None:
    _seed_tiny(session)
    app = create_app()
    client = TestClient(app)
    assert client.get("/v1/index").status_code == 401
    headers = {"X-API-Key": get_settings().api_key}
    res = client.get("/v1/index?frequency=daily", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body
    assert "value" in body[0]
    assert client.get("/v1/heatmap", headers=headers).status_code == 200
    assert client.get("/v1/elasticity", headers=headers).status_code == 200
    assert client.get("/v1/health/collection", headers=headers).status_code == 200
    assert client.get("/v1/backtest/dgca", headers=headers).status_code == 200
    assert client.get("/health").status_code == 200
