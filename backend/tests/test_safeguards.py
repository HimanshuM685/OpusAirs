from app.collectors.safeguards import looks_like_challenge


def test_challenge_detected() -> None:
    assert looks_like_challenge("please complete the captcha", 200)
    assert looks_like_challenge("ok", 429)
    assert looks_like_challenge("verify you are human", 403)
    assert not looks_like_challenge("<div data-flight='6E101'>₹5000</div>", 200)


def test_robots_allows_localhost_mock() -> None:
    from app.collectors.safeguards import RobotsGate

    gate = RobotsGate()
    # Unreachable robots.txt on localhost is fail-open for the mock host.
    assert gate.allowed("http://127.0.0.1:8090/search?origin=DEL&destination=BOM") is True
