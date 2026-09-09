from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_data_dir() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        Path("/data"),
        here.parents[2] / "data",
        here.parents[1].parent / "data",
    ]
    for c in candidates:
        if (c / "psd_basket.csv").exists():
            return c
    return here.parents[2] / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = f"sqlite:///{Path(__file__).resolve().parents[1] / 'opusairs.db'}"
    api_key: str = "nso-demo-key"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    mock_airline_url: str = "http://127.0.0.1:8090"
    amadeus_api_key: str | None = None
    amadeus_api_secret: str | None = None
    apix_base_date: str = "2026-08-01"
    data_dir: Path = _default_data_dir()
    user_agent: str = (
        "OpusAirs-APIx-Research/1.0 (+https://mospi.gov.in; ethical-cpi-research)"
    )
    rate_limit_seconds: float = 0.4
    live_rate_limit_seconds: float = 8.0
    scrape_max_searches: int = 18
    scrape_enabled: bool = False
    collect_enabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
