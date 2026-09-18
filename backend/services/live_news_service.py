"""Compatibility wrapper for FreightOne's inbuilt intelligence feed.

The project intentionally does not depend on GDELT, Google News RSS or other
rate-limited news providers. The existing module name is retained so older
imports continue to work, while the dashboard receives deterministic demo data.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict
from .data_loader import news_feed


def fetch_live_news(*, material: str | None = None, origin: str | None = None,
                    port: str | None = None, **_: Any) -> Dict[str, Any]:
    data = news_feed()
    return {
        "items": data.get("items", [])[:15],
        "live": False,
        "source": "FreightOne inbuilt news feed",
        "updated_at": data.get("updated_on") or datetime.now(timezone.utc).isoformat(),
        "error": None,
        "scope": "Freight, maritime and marine-weather intelligence",
    }
