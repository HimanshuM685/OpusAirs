from __future__ import annotations

from datetime import date, datetime, timedelta
from urllib.parse import urlencode

from app.basket import CARRIERS, FARE_CLASS, LEAD_TIMES, load_psd_basket
from app.collectors.safeguards import (
    CollectionEvent,
    HostLimiter,
    RobotsGate,
    looks_like_challenge,
)
from app.config import get_settings


class PlaywrightMockAirline:
    name = "mock_airline"

    def __init__(self, base_url: str | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.mock_airline_url).rstrip("/")
        self.limiter = HostLimiter()
        self.robots = RobotsGate()

    def collect(self, collected_on: date | None = None) -> list[CollectionEvent]:
        from playwright.sync_api import sync_playwright

        collected_on = collected_on or date.today()
        settings = get_settings()
        events: list[CollectionEvent] = []
        routes = load_psd_basket()

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=settings.user_agent)
            page = context.new_page()
            try:
                for route in routes:
                    for lt in LEAD_TIMES:
                        dep = collected_on + timedelta(days=lt)
                        search = f"{self.base_url}/search?{urlencode({'origin': route.origin, 'destination': route.destination, 'date': dep.isoformat()})}"
                        if not self.robots.allowed(search):
                            events.append(
                                self._blocked(route.origin, route.destination, collected_on, dep, lt, "robots.txt")
                            )
                            continue
                        self.limiter.wait(search)
                        page.goto(search, wait_until="networkidle", timeout=20000)
                        html = page.content()
                        if looks_like_challenge(html) or page.locator("[data-challenge='1']").count() > 0:
                            events.append(
                                self._blocked(route.origin, route.destination, collected_on, dep, lt, "challenge")
                            )
                            continue
                        page.wait_for_selector("[data-flight], [data-empty='1']", timeout=10000)
                        cards = page.locator("[data-flight]").all()
                        if not cards:
                            events.append(
                                CollectionEvent(
                                    source=self.name,
                                    origin=route.origin,
                                    destination=route.destination,
                                    carrier="",
                                    flight_no="",
                                    dep_date=dep,
                                    fare_class=FARE_CLASS,
                                    lead_time_days=lt,
                                    collected_on=collected_on,
                                    collected_at=datetime.utcnow(),
                                    status="missing",
                                )
                            )
                            continue
                        for card in cards:
                            status = card.get_attribute("data-status") or "ok"
                            carrier = card.get_attribute("data-carrier") or ""
                            flight_no = card.get_attribute("data-flight") or ""
                            events.append(
                                CollectionEvent(
                                    source=self.name,
                                    origin=route.origin,
                                    destination=route.destination,
                                    carrier=carrier,
                                    flight_no=flight_no,
                                    dep_date=dep,
                                    fare_class=FARE_CLASS,
                                    lead_time_days=lt,
                                    collected_on=collected_on,
                                    collected_at=datetime.utcnow(),
                                    status=status,
                                    base_fare=_attr_float(card.get_attribute("data-base")),
                                    taxes=_attr_float(card.get_attribute("data-taxes")),
                                    udf=_attr_float(card.get_attribute("data-udf")),
                                    convenience=_attr_float(card.get_attribute("data-convenience")),
                                    total_fare=_attr_float(card.get_attribute("data-total")),
                                )
                            )
            finally:
                context.close()
                browser.close()
        return events

    def _blocked(self, origin: str, dest: str, collected_on: date, dep: date, lt: int, notes: str) -> CollectionEvent:
        return CollectionEvent(
            source=self.name,
            origin=origin,
            destination=dest,
            carrier="",
            flight_no="",
            dep_date=dep,
            fare_class=FARE_CLASS,
            lead_time_days=lt,
            collected_on=collected_on,
            collected_at=datetime.utcnow(),
            status="blocked",
            notes=notes,
        )


def _attr_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None
