from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Protocol
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.config import get_settings

CHALLENGE_MARKERS = (
    "captcha",
    "recaptcha",
    "hcaptcha",
    "cf-challenge",
    "checking your browser",
    "access denied",
    "unusual traffic",
    "verify you are human",
)


@dataclass
class CollectionEvent:
    source: str
    origin: str
    destination: str
    carrier: str
    flight_no: str
    dep_date: date
    fare_class: str
    lead_time_days: int
    collected_on: date
    collected_at: datetime
    status: str  # ok | missing | sold_out | blocked | cancelled
    base_fare: float | None = None
    taxes: float | None = None
    udf: float | None = None
    convenience: float | None = None
    total_fare: float | None = None
    notes: str = ""


class FareCollector(Protocol):
    name: str

    def collect(self, collected_on: date | None = None) -> list[CollectionEvent]:
        ...


def looks_like_challenge(html: str, status_code: int | None = None) -> bool:
    if status_code in {401, 403, 429, 503}:
        lowered = (html or "").lower()
        if status_code == 429:
            return True
        if any(m in lowered for m in CHALLENGE_MARKERS):
            return True
        if status_code in {401, 403}:
            return True
    text = (html or "").lower()
    return any(m in text for m in CHALLENGE_MARKERS)


class HostLimiter:
    def __init__(self, seconds: float | None = None) -> None:
        self.seconds = seconds if seconds is not None else get_settings().rate_limit_seconds
        self._last: dict[str, float] = {}

    def wait(self, url: str) -> None:
        host = urlparse(url).netloc or url
        now = time.monotonic()
        last = self._last.get(host, 0.0)
        delay = self.seconds - (now - last)
        if delay > 0:
            time.sleep(delay)
        self._last[host] = time.monotonic()


class RobotsGate:
    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent or get_settings().user_agent
        self._cache: dict[str, RobotFileParser] = {}

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        root = f"{parsed.scheme}://{parsed.netloc}"
        if root not in self._cache:
            rp = RobotFileParser()
            rp.set_url(f"{root}/robots.txt")
            try:
                rp.read()
            except Exception:
                # Fail closed for unknown hosts: still allow localhost mock.
                if parsed.hostname in {"127.0.0.1", "localhost"}:
                    self._cache[root] = rp
                    return True
                return False
            self._cache[root] = rp
        return self._cache[root].can_fetch(self.user_agent, url)


def backoff_sleep(attempt: int, base: float = 0.5, cap: float = 8.0) -> None:
    time.sleep(min(cap, base * (2 ** attempt)))


def fetch_text(url: str, *, limiter: HostLimiter, robots: RobotsGate, timeout: float = 15.0) -> tuple[int, str]:
    settings = get_settings()
    if not robots.allowed(url):
        return 403, "robots.txt disallowed"
    limiter.wait(url)
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            with httpx.Client(headers={"User-Agent": settings.user_agent}, timeout=timeout, follow_redirects=True) as client:
                resp = client.get(url)
            if resp.status_code in {429, 503} and attempt < 3:
                backoff_sleep(attempt)
                limiter.wait(url)
                continue
            return resp.status_code, resp.text
        except httpx.HTTPError as exc:
            last_exc = exc
            backoff_sleep(attempt)
    return 0, str(last_exc or "request failed")
