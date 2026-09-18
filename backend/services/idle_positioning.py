"""
Idle / Positioning Advisor
--------------------------
Lightweight model addressing PS requirement for Idle Scenario Management:
- Forecast periods of soft demand (from BDI path)
- Estimate ballast cost for re-positioning
- Suggest alternative employment regions to reduce deadheading
"""

from __future__ import annotations
from typing import Dict, List, Any, Optional
from datetime import date, timedelta
from .bdi_forecast import forecast_bdi


# Approximate ballast distances (nm) from East Coast India discharge to next load region
BALLAST_NM = {
    "singapore_range": 1200,
    "indonesia": 1800,
    "australia": 3500,
    "persian_gulf": 1600,
    "south_africa": 4200,
    "us_gulf": 8500,
}

# Typical daily operating cost proxy by class (USD)
OPEX_USD_PD = {
    "Handysize": 6500,
    "Supramax": 7800,
    "Panamax": 9200,
    "Capesize": 12500,
}

# Regions with relatively stronger demand / better backhaul prospects
ALT_EMPLOYMENT = {
    "Handysize": ["singapore_range", "persian_gulf", "indonesia"],
    "Supramax": ["indonesia", "singapore_range", "australia"],
    "Panamax": ["australia", "indonesia", "south_africa"],
    "Capesize": ["australia", "brazil", "south_africa"],
}


def _soft_days(forecast: List[Dict], current_bdi: float, threshold: float = 0.97) -> List[Dict]:
    return [f for f in forecast if f["bdi"] < current_bdi * threshold]


def estimate_ballast_cost(vessel_class: str, target_region: str, days_waiting: int = 0) -> Dict:
    """Simple ballast cost = steaming days * (opex + bunker proxy)."""
    nm = BALLAST_NM.get(target_region, 2000)
    speed_kn = 12.5
    steam_days = nm / (speed_kn * 24)
    opex = OPEX_USD_PD.get(vessel_class, 8000)
    bunker_proxy = 4500  # rough daily bunker at eco speed
    total = (steam_days + days_waiting) * (opex + bunker_proxy * 0.6)
    return {
        "target_region": target_region,
        "ballast_nm": nm,
        "steam_days": round(steam_days, 1),
        "waiting_days": days_waiting,
        "est_cost_usd": round(total),
        "daily_burn_usd": round(opex + bunker_proxy * 0.6),
    }


def idle_scenario_advice(
    vessel_class: str = "Panamax",
    origin: str = "australia",
    current_region: str = "east_coast_india",
    horizon_days: int = 45,
) -> Dict[str, Any]:
    """
    Returns structured idle/positioning recommendation.
    """
    fc = forecast_bdi(min(90, horizon_days + 15))
    current = fc["indices"]["BDI"]
    forecast = fc["forecast"][:horizon_days]
    soft = _soft_days(forecast, current)

    soft_ratio = len(soft) / max(1, len(forecast))
    soft_window = None
    if soft:
        soft_window = {
            "start_day": soft[0]["day"],
            "end_day": soft[-1]["day"],
            "avg_bdi": round(sum(s["bdi"] for s in soft) / len(soft)),
            "days": len(soft),
        }

    alts = ALT_EMPLOYMENT.get(vessel_class, ["singapore_range", "indonesia"])
    options = []
    for region in alts[:3]:
        cost = estimate_ballast_cost(vessel_class, region, days_waiting=3 if soft_ratio > 0.4 else 0)
        # Relative attractiveness: lower cost + known demand
        score = 100 - (cost["est_cost_usd"] / 50000) * 40
        if region in ("indonesia", "singapore_range") and vessel_class in ("Handysize", "Supramax"):
            score += 12
        if region == "australia" and vessel_class in ("Panamax", "Capesize"):
            score += 10
        options.append({
            **cost,
            "attractiveness_score": round(max(0, min(100, score)), 1),
            "rationale": (
                f"Ballast ~{cost['steam_days']} days to {region.replace('_', ' ')}. "
                f"Preferred for {vessel_class} backhaul / next cargo prospects."
            ),
        })
    options.sort(key=lambda x: -x["attractiveness_score"])

    recommendation = "Hold near East Coast / wait for recovery"
    if soft_ratio > 0.55:
        recommendation = (
            f"Rates soft for ~{int(soft_ratio*100)}% of next {horizon_days} days. "
            f"Prefer ballasting toward {options[0]['target_region'].replace('_', ' ')} "
            f"rather than fixing low or remaining idle at anchorage."
        )
    elif soft_ratio > 0.3:
        recommendation = (
            "Mixed outlook. Consider short wait or slow-steam; only ballast if next cargo is already lined up."
        )
    else:
        recommendation = (
            "Demand expected to hold. Minimise ballast; look for prompt employment from East Coast or nearby."
        )

    return {
        "vessel_class": vessel_class,
        "current_region": current_region,
        "horizon_days": horizon_days,
        "current_bdi": current,
        "soft_demand_ratio": round(soft_ratio, 2),
        "soft_window": soft_window,
        "recommendation": recommendation,
        "alternative_employment": options,
        "best_reposition": options[0] if options else None,
        "model": "idle-positioning-v1",
    }
