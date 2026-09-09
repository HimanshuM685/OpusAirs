from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

from app.basket import FARE_CLASS, load_psd_basket
from app.collectors.safeguards import (
    CollectionEvent,
    HostLimiter,
    RobotsGate,
    looks_like_challenge,
)
from app.config import get_settings

INR_RE = re.compile(r"(?:₹|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})+|[0-9]{3,6})")


def _load_config() -> dict:
    settings = get_settings()
    path: Path = settings.data_dir / "scrape_sources.json"
    if not path.exists():
        return {"max_searches_per_run": 0, "lead_times": [7], "sources": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _parse_inr(text: str | None) -> float | None:
    if not text:
        return None
    cleaned = text.replace(",", "").replace("₹", "").replace("INR", "").strip()
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)", cleaned)
    if not match:
        return None
    value = float(match.group(1))
    if 800 <= value <= 80000:
        return value
    return None


def _fares_from_html(html: str) -> list[float]:
    found: list[float] = []
    for raw in INR_RE.findall(html or ""):
        value = _parse_inr(raw)
        if value is not None:
            found.append(value)
    return found


class PlaywrightPortalCollector:
    """Ethical Playwright collector against live airline homepages/search URLs.

    Checks robots.txt, rate-limits, aborts on CAPTCHA/challenge. Does not rotate
    IPs or solve challenges. Tune CSS selectors in data/scrape_sources.json.
    When a portal blocks, feed the same rows via /v1/ingest.
    """

    name = "portals"

    def __init__(self) -> None:
        settings = get_settings()
        self.limiter = HostLimiter(settings.live_rate_limit_seconds)
        self.robots = RobotsGate()
        self.config = _load_config()

    def collect(self, collected_on: date | None = None) -> list[CollectionEvent]:
        from playwright.sync_api import sync_playwright

        collected_on = collected_on or date.today()
        settings = get_settings()
        routes = load_psd_basket()
        lead_times = [int(x) for x in self.config.get("lead_times") or [1, 7, 21]]
        budget = int(self.config.get("max_searches_per_run") or settings.scrape_max_searches)
        sources = [s for s in self.config.get("sources", []) if s.get("enabled")]
        events: list[CollectionEvent] = []
        searches = 0

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=settings.user_agent)
            page = context.new_page()
            try:
                for source in sources:
                    if searches >= budget:
                        break
                    start = source.get("start_url") or source.get("search_url_template", "")
                    if start and not self.robots.allowed(start.split("?")[0]):
                        events.append(
                            self._event(
                                source,
                                routes[0].origin,
                                routes[0].destination,
                                collected_on,
                                collected_on + timedelta(days=lead_times[0]),
                                lead_times[0],
                                "blocked",
                                notes="robots.txt disallowed",
                            )
                        )
                        continue
                    for route in routes:
                        if searches >= budget:
                            break
                        for lt in lead_times:
                            if searches >= budget:
                                break
                            dep = collected_on + timedelta(days=lt)
                            template = source.get("search_url_template") or source.get("start_url")
                            url = template.format(
                                origin=route.origin,
                                destination=route.destination,
                                date=dep.isoformat(),
                            )
                            if not self.robots.allowed(url):
                                events.append(
                                    self._event(
                                        source, route.origin, route.destination,
                                        collected_on, dep, lt, "blocked", notes="robots.txt",
                                    )
                                )
                                continue
                            self.limiter.wait(url)
                            searches += 1
                            try:
                                page.goto(url, wait_until="domcontentloaded", timeout=25000)
                                page.wait_for_timeout(1500)
                            except Exception as exc:
                                events.append(
                                    self._event(
                                        source, route.origin, route.destination,
                                        collected_on, dep, lt, "blocked", notes=str(exc)[:200],
                                    )
                                )
                                continue
                            html = page.content()
                            if looks_like_challenge(html):
                                events.append(
                                    self._event(
                                        source, route.origin, route.destination,
                                        collected_on, dep, lt, "blocked", notes="challenge",
                                    )
                                )
                                continue
                            extracted = self._extract(page, html, source)
                            if not extracted:
                                events.append(
                                    self._event(
                                        source, route.origin, route.destination,
                                        collected_on, dep, lt, "missing",
                                    )
                                )
                                continue
                            for row in extracted:
                                events.append(
                                    self._event(
                                        source,
                                        route.origin,
                                        route.destination,
                                        collected_on,
                                        dep,
                                        lt,
                                        row.get("status") or "ok",
                                        flight_no=row.get("flight_no") or "NA",
                                        total=row.get("total"),
                                    )
                                )
            finally:
                context.close()
                browser.close()
        return events

    def _extract(self, page, html: str, source: dict) -> list[dict]:
        rows: list[dict] = []
        card_sel = source.get("flight_card") or ""
        price_sel = source.get("price") or ""
        flight_sel = source.get("flight_no") or ""
        try:
            cards = page.locator(card_sel).all() if card_sel else []
        except Exception:
            cards = []
        for card in cards[:12]:
            try:
                price_text = card.locator(price_sel).first.inner_text(timeout=500) if price_sel else card.inner_text()
            except Exception:
                price_text = ""
            try:
                flight_text = card.locator(flight_sel).first.inner_text(timeout=500) if flight_sel else ""
            except Exception:
                flight_text = ""
            total = _parse_inr(price_text)
            if total is None:
                continue
            rows.append({"flight_no": (flight_text or "NA")[:16], "total": total, "status": "ok"})
        if rows:
            return rows
        fares = _fares_from_html(html)
        if len(fares) >= 2:
            lowest = min(fares)
            return [{"flight_no": "NA", "total": lowest, "status": "ok"}]
        return []

    def _event(
        self,
        source: dict,
        origin: str,
        dest: str,
        collected_on: date,
        dep: date,
        lt: int,
        status: str,
        *,
        flight_no: str = "NA",
        total: float | None = None,
        notes: str = "",
    ) -> CollectionEvent:
        return CollectionEvent(
            source=source.get("id") or self.name,
            origin=origin,
            destination=dest,
            carrier=source.get("carrier") or "NA",
            flight_no=flight_no or "NA",
            dep_date=dep,
            fare_class=FARE_CLASS,
            lead_time_days=lt,
            collected_on=collected_on,
            collected_at=datetime.utcnow(),
            status=status,
            total_fare=total,
            notes=notes,
        )
