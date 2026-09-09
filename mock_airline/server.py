"""Local JS-rendered airline search UI for ethical Playwright demos. Not a real carrier."""

from __future__ import annotations

import hashlib
import random
from datetime import date, datetime

from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse, PlainTextResponse

LEAD_MULT = {1: 1.85, 7: 1.35, 15: 1.10, 21: 1.00, 30: 0.92, 45: 0.88}
ROUTE_BASE = {
    "DEL-BOM": 5200,
    "DEL-BLR": 5800,
    "BOM-BLR": 4300,
    "DEL-HYD": 4900,
    "DEL-CCU": 5400,
    "DEL-PNQ": 4400,
    "BOM-MAA": 4600,
    "DEL-AMD": 3900,
    "MAA-DEL": 5400,
    "BOM-HYD": 4100,
    "BLR-HYD": 3400,
    "DEL-GOI": 5100,
}
CARRIERS = [("6E", 0.95), ("AI", 1.08), ("QP", 0.90), ("SG", 1.02)]

app = FastAPI(title="OpusAirs Mock Airline")


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots() -> str:
    return (
        "User-agent: OpusAirs-APIx-Research/1.0\n"
        "Allow: /search\n"
        "Allow: /api/\n"
        "Disallow: /admin\n"
        "\n"
        "User-agent: *\n"
        "Allow: /search\n"
        "Allow: /api/\n"
        "Disallow: /admin\n"
    )


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "mock-airline"}


def _flights(origin: str, destination: str, dep: date) -> list[dict]:
    key = f"{origin}-{destination}"
    base0 = ROUTE_BASE.get(key, 4500)
    today = date.today()
    lt = max(1, (dep - today).days)
    # snap to nearest configured lead window for pricing
    nearest = min(LEAD_MULT, key=lambda x: abs(x - lt))
    weekend = 1.12 if dep.weekday() >= 5 else 1.0
    seed = int(hashlib.md5(f"{origin}{destination}{dep.isoformat()}".encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    out = []
    for code, mult in CARRIERS:
        base = base0 * LEAD_MULT[nearest] * mult * weekend * rng.uniform(0.95, 1.05)
        taxes = round(base * 0.12, 2)
        udf = 350.0
        conv = 0.0
        total = round(base + taxes + udf + conv, 2)
        sold = rng.random() < 0.08
        out.append(
            {
                "carrier": code,
                "flight": f"{code}{200 + rng.randint(0, 700)}",
                "status": "sold_out" if sold else "ok",
                "base": None if sold else round(base, 2),
                "taxes": None if sold else taxes,
                "udf": None if sold else udf,
                "convenience": None if sold else conv,
                "total": None if sold else total,
            }
        )
    return out


@app.get("/api/flights")
def api_flights(
    origin: str = Query(...),
    destination: str = Query(...),
    date_str: str = Query(..., alias="date"),
) -> dict:
    dep = date.fromisoformat(date_str)
    return {"origin": origin.upper(), "destination": destination.upper(), "date": dep.isoformat(), "flights": _flights(origin.upper(), destination.upper(), dep)}


SEARCH_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>MockAir search</title>
  <style>
    body { font-family: sans-serif; margin: 24px; background: #0b1220; color: #e8eefc; }
    .card { border: 1px solid #334; padding: 12px; margin: 8px 0; border-radius: 8px; }
    .sold { opacity: 0.5; }
  </style>
</head>
<body>
  <h1>MockAir</h1>
  <p id="meta">Loading JS-rendered results…</p>
  <div id="results"></div>
  <script>
    const params = new URLSearchParams(window.location.search);
    const origin = params.get('origin');
    const destination = params.get('destination');
    const date = params.get('date');
    const challenge = params.get('challenge');
    if (challenge === '1') {
      document.body.setAttribute('data-challenge', '1');
      document.getElementById('meta').textContent = 'verify you are human — captcha challenge';
    } else {
      fetch(`/api/flights?origin=${origin}&destination=${destination}&date=${date}`)
        .then(r => r.json())
        .then(data => {
          document.getElementById('meta').textContent = `${data.origin} → ${data.destination} on ${data.date}`;
          const root = document.getElementById('results');
          if (!data.flights.length) {
            root.innerHTML = '<p data-empty="1">No flights</p>';
            return;
          }
          data.flights.forEach(f => {
            const el = document.createElement('div');
            el.className = 'card' + (f.status === 'sold_out' ? ' sold' : '');
            el.setAttribute('data-flight', f.flight);
            el.setAttribute('data-carrier', f.carrier);
            el.setAttribute('data-status', f.status);
            if (f.total != null) {
              el.setAttribute('data-base', f.base);
              el.setAttribute('data-taxes', f.taxes);
              el.setAttribute('data-udf', f.udf);
              el.setAttribute('data-convenience', f.convenience);
              el.setAttribute('data-total', f.total);
            }
            el.textContent = f.status === 'sold_out'
              ? `${f.carrier} ${f.flight} SOLD OUT`
              : `${f.carrier} ${f.flight} ₹${f.total} (base ${f.base} + tax ${f.taxes} + UDF ${f.udf})`;
            root.appendChild(el);
          });
        });
    }
  </script>
</body>
</html>
"""


@app.get("/search", response_class=HTMLResponse)
def search() -> str:
    return SEARCH_HTML
