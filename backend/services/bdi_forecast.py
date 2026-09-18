"""
BDI Forecasting Module
----------------------
Uses the last 6 months of stored BDI history and produces a 90-day forward
path using a transparent, explainable formula:

  forecast[t] = level + trend * t + seasonal(t) + damping

where:
  - level / trend come from a simple Holt-style exponential smoother on the
    recent history,
  - seasonal is a light weekly component estimated from the last 8 weeks,
  - a small mean-reversion term pulls extreme projections back toward the
    recent 30-day mean.

This is deliberately data-driven and easy to replace later with a proper
ARIMA / Prophet / neural model once real high-frequency data is available.
"""

from __future__ import annotations
from datetime import date, timedelta
from typing import Dict, List, Tuple
import math
from .data_loader import bdi_history


def _holt_smooth(series: List[float], alpha: float = 0.35, beta: float = 0.15) -> Tuple[float, float]:
    """Return (level, trend) after Holt linear exponential smoothing."""
    if not series:
        return 1400.0, 0.0
    level = series[0]
    trend = series[1] - series[0] if len(series) > 1 else 0.0
    for y in series[1:]:
        prev_level = level
        level = alpha * y + (1 - alpha) * (level + trend)
        trend = beta * (level - prev_level) + (1 - beta) * trend
    return level, trend


def _weekly_seasonal(series: List[float], weeks: int = 8) -> List[float]:
    """Estimate average residual by day-of-week over the last `weeks` weeks."""
    n = min(len(series), weeks * 7)
    recent = series[-n:]
    mean = sum(recent) / len(recent)
    buckets = [[] for _ in range(7)]
    for i, v in enumerate(recent):
        buckets[i % 7].append(v - mean)
    seasonal = []
    for b in buckets:
        seasonal.append(sum(b) / len(b) if b else 0.0)
    return seasonal


def forecast_bdi(horizon_days: int = 90) -> Dict:
    """
    Returns:
      {
        "history": [ {date, bdi, ...}, ... ] last ~180 days,
        "forecast": [ {date, bdi, low, high}, ... ] next horizon_days,
        "booking_window": {best_day, expected_bdi, expected_savings_percent, reason},
        "indices": {BDI, Capesize, Panamax, Fuel, Congestion},
        "model": "holt-seasonal-v1"
      }
    """
    raw = bdi_history()
    series = raw.get("series", [])
    if not series:
        raise ValueError("BDI history is empty")

    # Use only BDI values
    values = [float(p["bdi"]) for p in series]
    level, trend = _holt_smooth(values)
    seasonal = _weekly_seasonal(values)

    # Recent mean for mean-reversion
    recent_mean = sum(values[-30:]) / min(30, len(values))

    last_date = date.fromisoformat(series[-1]["date"])
    history_out = series[-60:]  # last ~2 months for charts

    forecast_out = []
    for t in range(1, horizon_days + 1):
        d = last_date + timedelta(days=t)
        # damped trend
        damp = 0.97 ** t
        base = level + trend * t * damp
        sea = seasonal[(len(values) + t - 1) % 7]
        # mild mean reversion
        rev = 0.08 * (recent_mean - base)
        point = base + sea + rev
        # confidence band widens with horizon
        width = 18 + t * 0.55
        forecast_out.append({
            "date": d.isoformat(),
            "day": t,
            "bdi": round(max(800, point)),
            "low": round(max(750, point - width)),
            "high": round(point + width),
        })

    # Booking window = day of lowest expected BDI in next 45 days (practical window)
    window = forecast_out[:45]
    best = min(window, key=lambda x: x["bdi"])
    current = values[-1]
    savings_pct = max(0.0, round((current - best["bdi"]) / current * 100, 1))

    reason = (
        f"Model projects the softest freight window around day {best['day']} "
        f"(~{best['date']}) with expected BDI near {best['bdi']}. "
        f"Relative to today's level ({int(current)}), that implies ~{savings_pct}% "
        "potential rate relief before seasonal/mean-reversion forces reassert."
    )

    # Simple secondary indices derived from latest + forecast
    last = series[-1]
    indices = {
        "BDI": int(last["bdi"]),
        "Capesize": int(last.get("capesize", last["bdi"] * 15)),
        "Panamax": int(last.get("panamax", last["bdi"] * 10)),
        "Fuel": 592,          # simulated VLSFO indicator (USD/mt)
        "Congestion": 58,     # 0-100 composite East Coast congestion score
    }

    return {
        "history": history_out,
        "forecast": forecast_out,
        "booking_window": {
            "best_day": best["day"],
            "best_date": best["date"],
            "expected_bdi": best["bdi"],
            "expected_savings_percent": savings_pct,
            "reason": reason,
        },
        "indices": indices,
        "model": "holt-seasonal-v1",
        "as_of": last_date.isoformat(),
    }
