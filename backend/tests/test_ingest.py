from datetime import date, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import sqlalchemy_url
from app.ingest import parse_csv_quotes
from app.main import create_app


def test_neon_url_normalized() -> None:
    url = sqlalchemy_url(
        "postgresql://user:pass@ep-foo.ap-southeast-1.aws.neon.tech/neondb"
    )
    assert url.startswith("postgresql+psycopg://")
    assert "sslmode=require" in url


def test_ingest_json_upsert(session) -> None:
    app = create_app()
    client = TestClient(app)
    headers = {"X-API-Key": get_settings().api_key}
    payload = {
        "rebuild_index": True,
        "quotes": [
            {
                "source": "manual",
                "origin": "DEL",
                "destination": "BOM",
                "carrier": "6E",
                "flight_no": "6E201",
                "dep_date": "2026-09-17",
                "lead_time_days": 7,
                "collected_on": "2026-09-10",
                "total_fare": 5054,
            }
        ],
    }
    res = client.post("/v1/ingest/quotes", headers=headers, json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["received"] == 1
    assert body["inserted"] == 1
    payload["quotes"][0]["total_fare"] = 5200
    res2 = client.post("/v1/ingest/quotes", headers=headers, json=payload)
    assert res2.status_code == 200
    assert res2.json()["updated"] == 1
    quotes = client.get("/v1/quotes?origin=DEL&dest=BOM", headers=headers).json()
    assert quotes
    assert quotes[0]["total_fare"] == 5200


def test_parse_example_csv() -> None:
    path = Path(__file__).resolve().parents[2] / "data" / "quotes_manual.example.csv"
    quotes = parse_csv_quotes(path.read_text(encoding="utf-8"))
    assert len(quotes) >= 3
    assert quotes[0].origin == "DEL"
    assert quotes[0].destination == "BOM"


def test_ingest_csv(session) -> None:
    app = create_app()
    client = TestClient(app)
    headers = {"X-API-Key": get_settings().api_key}
    day = date(2026, 9, 10)
    csv_body = (
        "source,origin,destination,carrier,flight_no,dep_date,fare_class,lead_time_days,"
        "collected_on,base_fare,taxes,udf,convenience,total_fare,status\n"
        f"manual,BLR,HYD,QP,QP1,{(day + timedelta(days=7)).isoformat()},ECONOMY,7,"
        f"{day.isoformat()},3000,360,350,0,3710,ok\n"
    )
    res = client.post(
        "/v1/ingest/csv",
        headers=headers,
        files={"file": ("quotes.csv", csv_body, "text/csv")},
    )
    assert res.status_code == 200, res.text
    assert res.json()["inserted"] == 1
