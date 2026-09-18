"""Chartering decision layer for FreightOne.

Keeps the explainable Holt/ML forecast while adding vessel-class and route
specific timing, contract structure, confidence, and idle-management logic.
"""
from __future__ import annotations
from datetime import date
from math import ceil
from typing import Any, Dict, Optional

from .bdi_forecast import forecast_bdi
from .data_loader import size_route_rates
from .idle_positioning import idle_scenario_advice

VESSEL_CLASSES = {
    "Handysize": {"capacity_mt": 35000, "bdi_factor": 0.55, "typical_rate_usd_pd": 12000},
    "Supramax": {"capacity_mt": 55000, "bdi_factor": 0.75, "typical_rate_usd_pd": 15500},
    "Panamax": {"capacity_mt": 78000, "bdi_factor": 1.00, "typical_rate_usd_pd": 18500},
    "Capesize": {"capacity_mt": 145000, "bdi_factor": 1.45, "typical_rate_usd_pd": 28000},
}

ROUTE_PREMIUM = {
    "australia": 1.05, "indonesia": 0.92, "mozambique": 0.98,
    "usa": 1.25, "brazil": 1.18, "south_africa": 1.08,
    "uae": 0.88, "oman": 0.86,
}


def _priority_label(priority: str) -> str:
    return priority if priority in {"cost", "time", "balanced"} else "balanced"


def _days_to_deadline(deadline: Optional[str]) -> int:
    if not deadline:
        return 45
    try:
        return max(1, (date.fromisoformat(str(deadline)[:10]) - date.today()).days)
    except Exception:
        return 45


def _route_factor(origin: str) -> float:
    return ROUTE_PREMIUM.get(str(origin).lower().replace(" ", "_"), 1.0)


def _entry_window(forecast, route_factor: float, vessel_factor: float, days: int) -> Dict[str, Any]:
    horizon = min(45, max(1, days))
    scored = []
    for p in forecast[:horizon]:
        idx = p["bdi"] * vessel_factor * route_factor
        scored.append((idx, p))
    best_idx, best = min(scored, key=lambda x: x[0])
    low_threshold = best_idx * 1.035
    window = [p for idx, p in scored if idx <= low_threshold]
    return {
        "best_day": best["day"], "best_date": best["date"],
        "window_start_day": window[0]["day"], "window_end_day": window[-1]["day"],
        "expected_index": round(best_idx),
        "expected_bdi": best["bdi"],
        "forecast_low": round(best.get("low", best["bdi"]) * vessel_factor * route_factor),
        "forecast_high": round(best.get("high", best["bdi"]) * vessel_factor * route_factor),
    }


def recommend_charter_strategy(origin: str, dest_port: str, cargo_mt: float,
                               deadline: Optional[str] = None,
                               priority: str = "cost",
                               vessel_class_hint: Optional[str] = None) -> Dict[str, Any]:
    priority = _priority_label(priority)
    fc = forecast_bdi(90)
    forecast = fc.get("forecast", [])
    current_bdi = float(fc["indices"]["BDI"])
    days_left = _days_to_deadline(deadline)

    if vessel_class_hint in VESSEL_CLASSES:
        vessel_class = vessel_class_hint
    elif cargo_mt <= 40000:
        vessel_class = "Handysize"
    elif cargo_mt <= 65000:
        vessel_class = "Supramax"
    elif cargo_mt <= 95000:
        vessel_class = "Panamax"
    else:
        vessel_class = "Capesize"

    v = VESSEL_CLASSES[vessel_class]
    route_factor = _route_factor(origin)
    window = _entry_window(forecast, route_factor, v["bdi_factor"], days_left)
    capacity = v["capacity_mt"]
    voyages = max(1, ceil(float(cargo_mt) / capacity))

    # Use a common route/class index so contract choices are comparable.
    current_index = current_bdi * v["bdi_factor"] * route_factor
    entry_index = window["expected_index"]
    base_day_rate = v["typical_rate_usd_pd"] * (current_bdi / 1400) * route_factor
    entry_day_rate = v["typical_rate_usd_pd"] * (window["expected_bdi"] / 1400) * route_factor
    voyage_days = {"australia": 17, "indonesia": 12, "mozambique": 14, "usa": 30, "brazil": 28, "south_africa": 20, "uae": 10, "oman": 9}.get(origin, 18) + 5

    spot = base_day_rate * voyage_days * voyages * 1.08
    coa = entry_day_rate * voyage_days * voyages * (0.96 if voyages >= 2 else 1.0)
    tc_days = max(60, voyage_days * voyages + 15)
    tc = entry_day_rate * tc_days * 0.93

    if days_left < 18:
        preferred = "Spot"
        reason = "The deadline is too close to wait for a forecast window; secure prompt tonnage now."
        entry_text = "Immediate · 0–5 days"
    elif voyages >= 2 and days_left >= 30:
        preferred = "3-Voyage COA / Consecutive Voyage"
        reason = f"{voyages} voyages are required. A multi-voyage structure reduces repeated spot exposure while the forecast points to a softer entry window."
        entry_text = f"Day {window['window_start_day']}–{window['window_end_day']} · target {window['best_date']}"
    else:
        preferred = "Short Time Charter (3–6 months)" if voyages >= 3 else "Spot or 2-Voyage"
        reason = "The programme benefits from flexibility; compare the forecast window with the manager's deadline preference before fixing."
        entry_text = f"Day {window['window_start_day']}–{window['window_end_day']} · target {window['best_date']}"

    saving = max(0, round((spot - (coa if "COA" in preferred else tc if "Time Charter" in preferred else spot)) / spot * 100, 1))
    confidence = max(0.45, min(0.93, 1 - ((window["forecast_high"] - window["forecast_low"]) / max(1, window["expected_index"]) * 0.7)))

    risk_flags = []
    if days_left < 25: risk_flags.append("Compressed deadline limits the ability to wait for a soft freight window.")
    if current_bdi > 1650: risk_flags.append("BDI is elevated; spot fixtures have higher rate exposure.")
    if confidence < 0.65: risk_flags.append("Forecast band is wide; treat the target window as indicative.")
    if voyages >= 3: risk_flags.append("Large programme; locking capacity can reduce repeated fixture risk.")

    idle = idle_scenario_advice(vessel_class=vessel_class, origin=origin, horizon_days=min(45, days_left + 5))
    comparison = [
        {"structure": "Spot", "est_cost_usd": round(spot), "volatility_exposure": 82, "flexibility": "High", "best_for": "Urgent / single voyage"},
        {"structure": "Multi-voyage / COA", "est_cost_usd": round(coa), "volatility_exposure": 42, "flexibility": "Medium", "best_for": "2+ planned voyages"},
        {"structure": "Short Time Charter", "est_cost_usd": round(tc), "volatility_exposure": 30, "flexibility": "High", "best_for": "Recurring cargo programme"},
    ]
    return {
        "origin": origin, "dest_port": dest_port, "cargo_mt": cargo_mt,
        "recommended_vessel_class": vessel_class, "voyages_needed": voyages,
        "preferred_contract": preferred, "entry_window": entry_text,
        "entry_window_detail": window, "best_entry_day": window["best_day"],
        "best_entry_date": window["best_date"], "expected_savings_pct_vs_spot": saving,
        "confidence": round(confidence, 2), "reason": reason,
        "rate_context": {
            "current_bdi": round(current_bdi), "current_route_class_index": round(current_index),
            "projected_entry_route_class_index": entry_index, "route_factor": route_factor,
            "vessel_class": vessel_class, "forecast_band_at_entry": window["forecast_high"] - window["forecast_low"],
        },
        "cost_comparison": {"spot_est_usd": round(spot), "multi_voyage_est_usd": round(coa), "short_tc_est_usd": round(tc)},
        "contract_comparison": comparison, "idle_positioning": idle,
        "idle_positioning_advice": [idle["recommendation"]] + [x["rationale"] for x in idle.get("alternative_employment", [])[:2]],
        "risk_flags": risk_flags, "priority_used": priority, "model": "charter-strategy-v3",
    }


def size_route_rate_forecast(horizon_days: int = 60) -> Dict[str, Any]:
    """Return class and trade-lane curves using the ML/Holt freight path."""
    base = forecast_bdi(horizon_days)
    fc = base["forecast"]
    classes = {name: [{"date": p["date"], "day": p["day"], "index": round(p["bdi"] * info["bdi_factor"]), "low": round(p["low"] * info["bdi_factor"]), "high": round(p["high"] * info["bdi_factor"])} for p in fc] for name, info in VESSEL_CLASSES.items()}
    routes = {f"{origin}-east_coast": [{"date": p["date"], "day": p["day"], "index": round(p["bdi"] * factor), "low": round(p["low"] * factor), "high": round(p["high"] * factor)} for p in fc] for origin, factor in ROUTE_PREMIUM.items()}
    try:
        historical = size_route_rates()
    except Exception:
        historical = {}
    return {**base, "by_vessel_class": classes, "by_trade_lane": routes, "history_by_class": historical.get("by_class", {}), "history_by_route": historical.get("by_route", {}), "bdi_forecast": fc}
