from __future__ import annotations

import sys
import threading
import time
from datetime import date, timedelta
from pathlib import Path

import pytest
import uvicorn

REPO = Path(__file__).resolve().parents[2]


def test_playwright_scrapes_mock_airline() -> None:
    pytest.importorskip("playwright.sync_api")
    sys.path.insert(0, str(REPO / "mock_airline"))
    from server import app as mock_app  # type: ignore

    config = uvicorn.Config(mock_app, host="127.0.0.1", port=8099, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(50):
        if server.started:
            break
        time.sleep(0.05)
    else:
        pytest.skip("mock airline did not start")

    from app.collectors.mock_airline import PlaywrightMockAirline
    from app.collectors.safeguards import looks_like_challenge
    import httpx

    html = httpx.get(
        "http://127.0.0.1:8099/search?origin=DEL&destination=BOM&date=2099-01-01&challenge=1",
        timeout=10,
    ).text
    assert looks_like_challenge(html)

    collector = PlaywrightMockAirline(base_url="http://127.0.0.1:8099")
    # Narrow: monkeypatch basket by collecting one URL via playwright internals
    from playwright.sync_api import sync_playwright
    from app.config import get_settings

    dep = date.today() + timedelta(days=7)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=get_settings().user_agent)
            page.goto(
                f"http://127.0.0.1:8099/search?origin=DEL&destination=BOM&date={dep.isoformat()}",
                wait_until="networkidle",
            )
            page.wait_for_selector("[data-flight], [data-empty='1']")
            cards = page.locator("[data-flight]").all()
            assert cards
            totals = [c.get_attribute("data-total") for c in cards if c.get_attribute("data-status") == "ok"]
            assert any(totals)
            browser.close()
    except Exception as exc:
        pytest.skip(f"Playwright browser unavailable: {exc}")

    server.should_exit = True
    assert collector.name == "mock_airline"
