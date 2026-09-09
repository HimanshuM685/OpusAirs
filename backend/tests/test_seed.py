from app.seed import SEED_DAYS, generate_quotes


def test_seed_has_thirty_five_days() -> None:
    quotes = generate_quotes()
    days = {q["collected_on"] for q in quotes}
    assert len(days) == SEED_DAYS
    assert any(q["status"] == "ok" for q in quotes)
    ok = next(q for q in quotes if q["status"] == "ok")
    assert ok["total_fare"] > ok["base_fare"]
