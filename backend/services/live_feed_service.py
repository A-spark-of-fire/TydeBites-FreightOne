"""Live external feeds with local JSON fallback.

Uses only HTTP calls from the existing httpx dependency. No existing data file
is overwritten. If a provider is unavailable, the prototype's static data is
returned so the dashboard remains usable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import json
from pathlib import Path

import httpx

BASE = Path(__file__).resolve().parents[1]


def _json(name: str, default: Any):
    try:
        return json.loads((BASE / "data" / name).read_text(encoding="utf-8"))
    except Exception:
        return default


def _get(url: str, params: dict[str, Any] | None = None, timeout: float = 8.0):
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            r = client.get(url, params=params, headers={"User-Agent": "FreightOne/6.0"})
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def freight_news() -> list[dict[str, Any]]:
    fallback = _json("news_feed.json", {"items": []})
    return [{**x, "live": False, "type": "freight_news"} for x in fallback.get("items", [])]

def world_market() -> list[dict[str, Any]]:
    # Stooq is used for simple public market snapshots. The local cargo-price
    # file remains the fallback and is the authoritative prototype dataset.
    symbols = {"BDI proxy": "^BDI", "Coal proxy": "MTF=F"}
    rows = []
    for label, symbol in symbols.items():
        data = _get("https://stooq.com/q/l/", {"s": symbol, "f": "sd2t2ohlcv", "h": "", "e": "json"})
        if data and data.get("data"):
            d = data["data"][0]
            rows.append({"name": label, "symbol": symbol, "price": d.get("close"), "date": d.get("date"), "live": True})
    if rows:
        return rows
    raw = _json("cargo_prices.json", {"items": []})
    return [{**x, "live": False} for x in raw.get("items", [])]


def weather_report() -> dict[str, Any]:
    # Bay of Bengal reference point near the Indian east coast.
    data = _get(
        "https://marine-api.open-meteo.com/v1/marine",
        {"latitude": 18.5, "longitude": 87.5, "current": "wave_height,wave_direction,wave_period,wind_wave_height", "timezone": "Asia/Kolkata"},
    )
    if data:
        c = data.get("current", {})
        wave = float(c.get("wave_height") or 0)
        wind_wave = float(c.get("wind_wave_height") or 0)
        risk = min(100, round(wave * 22 + wind_wave * 18, 1))
        return {
            "region": "Bay of Bengal",
            "latitude": 18.5,
            "longitude": 87.5,
            "wave_height_m": wave,
            "wave_direction_deg": c.get("wave_direction"),
            "wave_period_s": c.get("wave_period"),
            "wind_wave_height_m": wind_wave,
            "risk_score": risk,
            "risk_level": "high" if risk >= 65 else "moderate" if risk >= 35 else "low",
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "live": True,
        }
    return {"region": "Bay of Bengal", "risk_score": 0, "risk_level": "unknown", "live": False, "source": "local fallback"}


def get_live_feed() -> dict[str, Any]:
    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "news": freight_news(),
        "market": world_market(),
        "weather": weather_report(),
    }
