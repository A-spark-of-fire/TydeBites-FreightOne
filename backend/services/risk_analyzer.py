"""
Risk Factor Analyser
--------------------
Combines:
  - Weather risk for Bay of Bengal (simulated / extendable to Open-Meteo)
  - Fuel price pressure
  - Market (BDI) momentum
  - Port congestion

Produces a single 0-100 network risk score and colour-coded level, plus
a weather series suitable for the frontend chart.
"""

from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List
import math
import random
from .data_loader import news_feed, destination_ports
from .bdi_forecast import forecast_bdi
from .weather_service import weather_service


# Fixed seed for reproducible demo behaviour within a day
def _daily_seed() -> int:
    return int(date.today().strftime("%Y%m%d"))


def weather_series(days: int = 14) -> List[Dict]:
    """Generate a smooth 14-day risk series (0-100) for Bay of Bengal."""
    random.seed(_daily_seed())
    base = 28 + random.randint(-4, 6)
    out = []
    for i in range(days):
        # mild oscillation + occasional spike
        wave = 14 * math.sin(i / 2.3) + 6 * math.sin(i / 5.1)
        spike = 12 if i in (4, 9) else 0
        risk = max(12, min(75, base + wave * 0.85 + spike * 0.7 + random.gauss(0, 2.5)))
        out.append({"day": i + 1, "risk": round(risk)})
    return out


def weather_risk_breakdown(series: List[Dict]) -> Dict[str, int]:
    """Map average risk into categorical delay probabilities."""
    avg = sum(p["risk"] for p in series) / len(series)
    # simple piecewise mapping
    if avg < 30:
        return {"no_delay": 62, "slight": 24, "moderate": 10, "high": 4}
    if avg < 45:
        return {"no_delay": 48, "slight": 28, "moderate": 16, "high": 8}
    if avg < 60:
        return {"no_delay": 35, "slight": 30, "moderate": 22, "high": 13}
    return {"no_delay": 22, "slight": 26, "moderate": 28, "high": 24}


def network_risk_score() -> Dict:
    """
    Composite risk:
      weather (40%) + market momentum (25%) + congestion (20%) + fuel (15%)
    """
    try:
        live_weather = weather_service.get_weather_report()
        live_series = live_weather.get("series") or []
        series = [{"day": i + 1, "risk": float(row.get("risk", 30))} for i, row in enumerate(live_series[:14])]
    except Exception:
        series = []
    if not series:
        series = weather_series(14)
    wx_avg = sum(p["risk"] for p in series) / len(series)

    fc = forecast_bdi(30)
    hist = fc["history"]
    if len(hist) >= 10:
        recent = [p["bdi"] for p in hist[-7:]]
        older = [p["bdi"] for p in hist[-14:-7]]
        mom = (sum(recent) / 7 - sum(older) / 7) / max(1, sum(older) / 7)
        market_pressure = max(0, min(100, 50 + mom * 180))
    else:
        market_pressure = 55

    ports = destination_ports()
    cong_vals = []
    for p in ports.values():
        q = p.get("avg_queue_days", 2)
        cong_vals.append(min(100, q * 18))
    congestion = sum(cong_vals) / len(cong_vals) if cong_vals else 40

    fuel_pressure = 48  # could be driven from a live bunker feed later

    score = (
        0.40 * wx_avg
        + 0.25 * market_pressure
        + 0.20 * congestion
        + 0.15 * fuel_pressure
    )
    # Soften overall network risk presentation
    score = round(max(5, min(88, score * 0.82)))

    if score < 35:
        level = "green"
    elif score < 58:
        level = "amber"
    else:
        level = "red"

    # Attach live-ish news
    news = news_feed().get("items", [])[:5]
    items = [
        {
            "title": n["title"],
            "text": n.get("summary", n["title"]),
            "tags": n.get("tags", [n.get("category", "RISK")]),
            "severity": n.get("severity", "medium"),
        }
        for n in news
    ]

    return {
        "risk_score": score,
        "risk_level": level,
        "components": {
            "weather": round(wx_avg),
            "market": round(market_pressure),
            "congestion": round(congestion),
            "fuel": round(fuel_pressure),
        },
        "items": items,
        "weather_source": "Open-Meteo Marine API with deterministic fallback",
        "as_of": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
    }


def full_weather_payload() -> Dict:
    series = weather_series(14)
    breakdown = weather_risk_breakdown(series)
    avg = sum(p["risk"] for p in series) / len(series)
    if avg < 35:
        status = "Generally favourable conditions across the Bay of Bengal."
    elif avg < 55:
        status = "Moderate residual monsoon activity — monitor berth windows."
    else:
        status = "Elevated weather risk — possible delays on East Coast arrivals."
    return {
        "series": series,
        "risk": breakdown,
        "status": status,
        "region": "Bay of Bengal",
        "updated": datetime.now(timezone(timedelta(hours=5, minutes=30))).isoformat(),
    }
