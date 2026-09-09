from app.cleaning.pipeline import _mad_flags, split_fare_components


def test_outlier_flags_extreme() -> None:
    values = [5000, 5100, 4900, 5050, 4950, 50000]
    flags = _mad_flags(values)
    assert flags[-1] is True
    assert flags[0] is False


def test_split_prefers_components() -> None:
    parts = split_fare_components(
        base_fare=4000, taxes=480, udf=350, convenience=99, total_fare=4929
    )
    assert parts is not None
    assert parts["base_fare"] == 4000
    assert parts["total_fare"] == 4929
