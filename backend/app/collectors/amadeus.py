from datetime import date

from app.collectors.safeguards import CollectionEvent
from app.config import get_settings


class AmadeusLive:
    """Optional licensed GDS adapter. Skipped unless AMADEUS_API_KEY is set.

    Does not scrape airline/OTA websites. Production use requires an Amadeus contract.
    """

    name = "amadeus"

    def collect(self, collected_on: date | None = None) -> list[CollectionEvent]:
        settings = get_settings()
        if not settings.amadeus_api_key:
            return []
        # Live Amadeus Flight Offers Search would go here with official credentials.
        return []
