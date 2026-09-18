"""
FreightOne Backend — SIH 2026
=============================
Modular FastAPI application. All operational data lives in backend/data/*.json
so that real feeds can be swapped in later without touching business logic.

Run:
  uvicorn main:app --reload --port 8000
  python -m uvicorn main:app --reload
"""

from __future__ import annotations
from datetime import date
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from services.weather_service import weather_service
from services.data_loader import (
    managers, materials, plants, consignments as load_consignments,
    source_ports, destination_ports, cargo_prices, news_feed, reload_all
)
from services.bdi_forecast import forecast_bdi
from services.charter_strategy import recommend_charter_strategy, size_route_rate_forecast
from services.ml_forecast import ml_forecast, ml_size_route_forecast
from services.auth_security import verify_plant_access, plant_access_demo_hints
from services.risk_analyzer import network_risk_score, full_weather_payload
from services.route_optimizer import rank_ports, rank_sources, procurement_plan, evaluate_route

# Additive intelligence modules. Existing services/routes below are preserved.
from services.finbert_service import analyze_news
from services.live_feed_service import get_live_feed
from services.live_news_service import fetch_live_news
from services.vessel_optimizer import optimize_vessels

app = FastAPI(
    title="FreightOne API",
    version="4.0.0",
    description="Intelligent Freight Forecasting & Vessel Chartering — East Coast India",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class LoginIn(BaseModel):
    user_id: str
    password: str


class RouteIn(BaseModel):
    material: str = "coking_coal"
    quantity_mt: float = 80000
    deadline_days: float = 21
    port: Optional[str] = "paradip"
    origin: Optional[str] = None
    plant_code: str = "RSP"
    priority: float = Field(55, ge=0, le=100)
    plant_access_code: Optional[str] = None  # layer-2 security
    min_quality_index: float = Field(0, ge=0, le=100)


class WhatIfIn(BaseModel):
    material: str = "coking_coal"
    quantity_mt: float = 80000
    deadline_days: float = 45
    port: str = "paradip"
    origin: Optional[str] = "australia"
    plant_code: str = "RSP"
    priority: float = 55
    alt_port: Optional[str] = None
    vessel_class: Optional[str] = None
    min_quality_index: float = Field(0, ge=0, le=100)


class VesselOptimizeIn(BaseModel):
    """Keep the destination fixed and optimise vessel choice across both ports."""
    port: str = "paradip"
    quantity_mt: float = 80000
    deadline_days: Optional[float] = 30
    origin: Optional[str] = None
    material: Optional[str] = "coking_coal"
    priority: float = Field(55, ge=0, le=100)
    min_quality_index: float = Field(0, ge=0, le=100)


class FinBERTIn(BaseModel):
    text: Optional[str] = None
    items: Optional[List[dict]] = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/login")
def login(body: LoginIn):
    for m in managers():
        if m["user_id"] == body.user_id and m["password"] == body.password:
            plant = plants().get(m["plant_code"], {})
            return {
                "manager": {
                    "id": m["id"],
                    "user_id": m["user_id"],
                    "name": m["name"],
                    "employee_id": m["employee_id"],
                    "post": m["post"],
                    "rank": m["rank"],
                    "plant": m["plant_code"],
                    "plant_name": m.get("plant_name") or plant.get("name"),
                    "posting_place": m["posting_place"],
                },
                "plant": {
                    "code": plant.get("code", m["plant_code"]),
                    "name": plant.get("name", m["plant_name"]),
                    "location": plant.get("location"),
                    "nearest_port": plant.get("nearest_port"),
                    "state": plant.get("state"),
                },
                "security": {
                    "layer1": "manager_login",
                    "layer2": "plant_access_code",
                    "plant_access_code_prefill": m["plant_code"],
                    "protected_modules": ["procurement", "consignment_tracker"],
                    "demo_hints": plant_access_demo_hints(),
                },
            }
    raise HTTPException(status_code=401, detail="Invalid Manager ID or password")


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

@app.get("/api/refs")
def refs():
    mats = {
        k: {
            "name": v["name"],
            "daily_consumption": v["typical_daily_consumption"],
            "safety_days": v["safety_days"],
        }
        for k, v in materials().items()
    }
    origins = {
        k: {
            "label": v["country"],
            "port_name": v.get("port_name"),
            "typical_transit_days": v["typical_transit_days_to_east_coast"],
            "max_draft_m": v.get("max_draft_m"),
            "max_loa_m": v.get("max_loa_m"),
            "max_beam_m": v.get("max_beam_m"),
            "max_dwt": v.get("max_dwt"),
            "loading_rate_mt_per_day": v.get("loading_rate_mt_per_day"),
            "quality_index": v.get("quality_index", {}),
        }
        for k, v in source_ports().items()
    }
    ports = {
        k: {"name": v["name"], "state": v["state"]}
        for k, v in destination_ports().items()
    }
    pls = {
        k: {
            "name": v["name"],
            "nearest_port": v["nearest_port"],
            "state": v["state"],
        }
        for k, v in plants().items()
    }
    return {"materials": mats, "origins": origins, "ports": ports, "plants": pls}


# ---------------------------------------------------------------------------
# BDI / Freight intelligence
# ---------------------------------------------------------------------------

@app.get("/api/forecast")
def api_forecast(horizon: int = Query(90, ge=30, le=120)):
    return forecast_bdi(horizon)


@app.get("/api/freight-intelligence")
def freight_intelligence():
    # Primary: ML multi-feature pipeline; falls back inside ml_forecast to Holt ensemble
    fc = ml_forecast(horizon_days=90)
    return {
        "forecast": {
            "history": fc.get("history"),
            "forecast": fc.get("forecast"),
        },
        "booking_window": fc.get("booking_window"),
        "indices": fc.get("indices"),
        "model": fc.get("model"),
        "feature_importance": fc.get("feature_importance"),
        "live_refresh": fc.get("live_refresh"),
        "training_points": fc.get("training_points"),
    }


# ---------------------------------------------------------------------------
# Risk & Weather
# ---------------------------------------------------------------------------

@app.get("/api/risk-score")
def risk_score():
    return network_risk_score()


@app.get('/api/weather')
def weather():
    """Bay of Bengal marine forecast series for charting + softened risk mix."""
    from datetime import datetime, timedelta, timezone
    payload = weather_service.get_weather_report()
    series = payload.get("series") or []
    # Normalise series for FE chart: date, wave_m, risk
    norm = []
    now = datetime.now(timezone.utc)
    for i, row in enumerate(series):
        if isinstance(row, dict):
            risk = row.get("risk", row.get("wave_height", 30))
            if isinstance(risk, (int, float)) and risk < 15:
                # treat as wave height metres → map to risk-ish display value
                wave = float(risk)
                risk_v = min(75, max(10, wave * 18))
            else:
                wave = row.get("wave_height") or row.get("current_wave_height_m") or (risk / 18)
                risk_v = float(risk) * 0.85  # slightly reduced risk index
            ts = row.get("time") or row.get("date") or (now + timedelta(hours=i)).isoformat()
            norm.append({
                "date": str(ts)[:16],
                "day": row.get("day", i + 1),
                "wave_m": round(float(wave), 2) if wave is not None else None,
                "risk": round(float(risk_v), 1),
            })
        else:
            norm.append({"date": (now + timedelta(hours=i)).isoformat()[:16], "day": i+1, "risk": 30, "wave_m": 1.5})
    if not norm:
        for i in range(24):
            import math
            wave = 1.2 + 0.6 * math.sin(i / 4) + (0.4 if 8 <= i <= 14 else 0)
            norm.append({
                "date": (now + timedelta(hours=i)).isoformat()[:16],
                "day": i + 1,
                "wave_m": round(wave, 2),
                "risk": round(min(70, 18 + wave * 14), 1),
            })
    risk_mix = payload.get("risk") or {}
    # map green/yellow... or no_delay style
    if "no_delay" not in risk_mix and "green" in risk_mix:
        risk_mix = {
            "no_delay": risk_mix.get("green", 40),
            "slight": risk_mix.get("yellow", 30),
            "moderate": risk_mix.get("orange", 20),
            "high": risk_mix.get("red", 10),
        }
    # soften high share slightly
    if risk_mix.get("high", 0) > 15:
        extra = risk_mix["high"] - 15
        risk_mix["high"] = 15
        risk_mix["no_delay"] = risk_mix.get("no_delay", 40) + extra
    return {
        "region": payload.get("region") or "Bay of Bengal",
        "status": payload.get("status") or "Operational",
        "current_wave_height_m": payload.get("current_wave_height_m"),
        "risk": risk_mix,
        "series": norm,
        "last_updated": payload.get("last_updated"),
        "note": "Wave height and hazard index along the Bay of Bengal shipping corridor.",
    }


@app.get("/api/news")
def news():
    """Deterministic inbuilt freight/weather/maritime feed for the demo."""
    return news_feed()

@app.get("/api/live-news")
def live_news(
    material: Optional[str] = None,
    origin: Optional[str] = None,
    port: Optional[str] = None,
):
    """Compatibility endpoint; deliberately uses the inbuilt feed."""
    return {**news_feed(), "live": False, "source": "FreightOne inbuilt news feed"}


# ---------------------------------------------------------------------------
# Consignments
# ---------------------------------------------------------------------------

@app.get("/api/consignments")
def consignments(plant_code: Optional[str] = None, status: Optional[str] = None,
                 plant_access_code: Optional[str] = None,
                 x_plant_access: Optional[str] = Header(default=None, alias="X-Plant-Access")):
    # Layer-2 plant gate for consignment tracker
    access = plant_access_code or x_plant_access
    if plant_code:
        if not access or not verify_plant_access(plant_code, access):
            raise HTTPException(403, "Plant access code required or invalid (two-layer security for Consignments).")
    items = load_consignments().get("items", [])
    if plant_code:
        items = [c for c in items if c.get("plant_code") == plant_code]
    if status:
        items = [c for c in items if str(c.get("status", "")).lower() == status.lower()]
    return {"consignments": items, "count": len(items)}


# ---------------------------------------------------------------------------
# Inventory & urgency
# ---------------------------------------------------------------------------

@app.get("/api/inventory")
def inventory(plant_code: str = "RSP"):
    plant = plants().get(plant_code)
    if not plant:
        raise HTTPException(404, "Plant not found")
    mats = materials()
    cons = load_consignments().get("items", [])
    out = []
    for mid, m in mats.items():
        inv = plant.get("inventory", {}).get(mid, {})
        stock = inv.get("stock_mt", 0)
        daily = m["typical_daily_consumption"]
        cover = stock / daily if daily else 0
        incoming = sum(
            c["tonnage"]
            for c in cons
            if c.get("plant_code") == plant_code
            and c.get("material") == mid
            and str(c.get("status", "")).lower() not in ("delivered",)
        )
        effective = (stock + incoming * 0.75) / daily if daily else 0
        safety_days = m.get("safety_days", 6)
        safety_mt = inv.get("safety_stock_mt") or (daily * safety_days)
        # stock_index: 0–2+ scale vs safety stock (1.0 = at safety level)
        stock_index = round(stock / safety_mt, 2) if safety_mt else 0.0
        # urgency from effective cover vs safety days (varied, not flat)
        if effective <= safety_days * 0.5:
            urgency = 9
        elif effective <= safety_days:
            urgency = 7
        elif effective <= safety_days * 1.5:
            urgency = 5
        elif effective <= safety_days * 2.5:
            urgency = 3
        else:
            urgency = 1
        # nudge by stock_index
        if stock_index < 0.8:
            urgency = min(10, urgency + 1)
        elif stock_index > 1.8:
            urgency = max(1, urgency - 1)
        rating = "Critical" if urgency >= 8 else "Watch" if urgency >= 5 else "Healthy"
        out.append({
            "id": mid,
            "material": m["name"],
            "stock_mt": stock,
            "safety_stock_mt": safety_mt,
            "daily_consumption": daily,
            "days_cover": round(cover, 1),
            "effective_cover": round(effective, 1),
            "incoming_mt": incoming,
            "stock_index": stock_index,
            "urgency_index": urgency,
            "rating": rating,
            "safety_days": safety_days,
        })
    return {"plant": plant["name"], "plant_code": plant_code, "items": out}


# ---------------------------------------------------------------------------
# Alerts (derived, not static)
# ---------------------------------------------------------------------------

@app.get("/api/alerts")
def alerts(plant_code: str = "RSP"):
    alerts_list = []
    for c in load_consignments().get("items", []):
        if str(c.get("status", "")).lower() == "delayed":
            alerts_list.append({
                "severity": "high",
                "type": "CONSIGNMENT",
                "title": f"{c['id']} is delayed by {c.get('delay_days', 0)} days",
                "impact": f"{c.get('material_label', c.get('material'))} supply exposure for {c.get('plant_code')}",
                "action": "Open recovery / reroute recommendation",
                "ref": c["id"],
            })
    risk = network_risk_score()
    if risk["risk_level"] in ("amber", "red"):
        alerts_list.append({
            "severity": "medium" if risk["risk_level"] == "amber" else "high",
            "type": "WEATHER",
            "title": "Bay of Bengal weather risk elevated",
            "impact": f"Network risk score {risk['risk_score']}/100",
            "action": "Monitor vessel ETAs and berth windows",
        })
    fc = forecast_bdi(30)
    trend = fc["forecast"][14]["bdi"] - fc["history"][-1]["bdi"]
    if trend > 40:
        alerts_list.append({
            "severity": "medium",
            "type": "MARKET",
            "title": "BDI trend remains upward",
            "impact": "Future charter cost sensitivity over next 2 weeks",
            "action": "Review booking window before further firming",
        })
    inv = inventory(plant_code)["items"]
    for item in inv:
        if item["urgency_index"] >= 8:
            alerts_list.append({
                "severity": "high",
                "type": "INVENTORY",
                "title": f"{item['material']} cover is critical",
                "impact": f"Only {item['days_cover']} days of cover at plant",
                "action": "Trigger procurement planner",
            })
    return {"alerts": alerts_list}


# ---------------------------------------------------------------------------
# Procurement planner
# ---------------------------------------------------------------------------

@app.post("/api/procurement")
def procurement(body: RouteIn):
    # Layer-2 plant gate (demo: access code == plant code)
    if not body.plant_access_code or not verify_plant_access(body.plant_code, body.plant_access_code):
        raise HTTPException(403, "Plant access code required or invalid (two-layer security for Procurement).")
    try:
        plan = procurement_plan(
            material=body.material,
            quantity_mt=body.quantity_mt,
            deadline_days=body.deadline_days,
            preferred_port=body.port,
            plant_code=body.plant_code,
            priority=body.priority,
            origin=body.origin,
            min_quality_index=body.min_quality_index,
        )
        return plan
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/api/route-options")
def route_options(body: RouteIn):
    ranking = rank_ports(
        material=body.material,
        plant_code=body.plant_code,
        quantity_mt=body.quantity_mt,
        origin=body.origin,
        priority_cost=body.priority,
        deadline_days=body.deadline_days,
        min_quality_index=body.min_quality_index,
    )
    selected = None
    if body.port:
        for o in ranking["options"]:
            if o["port"] == body.port:
                selected = o
                break
    return {
        "selected_port": selected or ranking.get("best"),
        "best_overall": ranking.get("best"),
        "options": ranking.get("options", []),
        "weights": ranking.get("weights"),
    }


# ---------------------------------------------------------------------------
# Port optimiser (same ranking engine)
# ---------------------------------------------------------------------------

@app.post("/api/optimizer")
def optimizer(body: RouteIn):
    ranking = rank_ports(
        material=body.material,
        plant_code=body.plant_code,
        quantity_mt=body.quantity_mt,
        origin=body.origin,
        priority_cost=body.priority,
        deadline_days=body.deadline_days,
        min_quality_index=body.min_quality_index,
    )
    best = ranking["best"]
    origin = body.origin or (best or {}).get("origin") or "australia"
    dest = (best or {}).get("port") or body.port or "paradip"
    from datetime import date, timedelta
    dl = (date.today() + timedelta(days=int(body.deadline_days or 45))).isoformat()
    priority_label = "cost" if body.priority < 40 else ("time" if body.priority > 65 else "balanced")
    charter = recommend_charter_strategy(
        origin=origin,
        dest_port=dest,
        cargo_mt=body.quantity_mt,
        deadline=dl,
        priority=priority_label,
    )
    # Attach charter summary onto best for FE consistency
    if best:
        best = dict(best)
        best["vessel_class"] = charter.get("recommended_vessel_class")
        best["voyages_needed"] = charter.get("voyages_needed")
        best["preferred_contract"] = charter.get("preferred_contract")
        best["entry_window"] = charter.get("entry_window")
        best["eta_status"] = (
            f"Arrives {(body.deadline_days or 45) - best.get('eta_days', 20):.0f} days vs deadline"
        )
        best["quality_index"] = best.get("quality_index")
    source_screen = rank_sources(
        material=body.material,
        plant_code=body.plant_code,
        quantity_mt=body.quantity_mt,
        destination_port=dest,
        deadline_days=body.deadline_days,
        min_quality_index=body.min_quality_index,
        priority_cost=body.priority,
    )
    return {
        "material": body.material,
        "plant_code": body.plant_code,
        "ranked": ranking["options"][:8],
        "best": best or None,
        "weights": ranking["weights"],
        "source_ranking": source_screen.get("options", [])[:5],
        "rejected_routes": ranking.get("rejected", [])[:10],
        "charter": charter,
        "recommendation": {
            "vessel_class": charter.get("recommended_vessel_class"),
            "preferred_contract": charter.get("preferred_contract"),
            "entry_window": charter.get("entry_window"),
            "voyages": charter.get("voyages_needed"),
            "savings_pct": charter.get("expected_savings_pct_vs_spot"),
            "confidence": charter.get("confidence"),
            "idle": charter.get("idle_positioning_advice", [])[:2],
            "risk_flags": charter.get("risk_flags", []),
        },
    }


# ---------------------------------------------------------------------------
# NEW — Vessel optimiser
# Port remains constant; only vessel size/type is changed.
# ---------------------------------------------------------------------------

@app.post("/api/vessel-optimizer")
def vessel_optimizer(body: VesselOptimizeIn):
    try:
        return optimize_vessels(
            port=body.port,
            quantity_mt=body.quantity_mt,
            deadline_days=body.deadline_days,
            origin=body.origin,
            material=body.material,
            priority=body.priority,
            min_quality_index=body.min_quality_index,
        )
    except (ValueError, KeyError, FileNotFoundError) as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/vessels")
def vessels(port: Optional[str] = None):
    """Expose vessel reference data for the additional optimiser row."""
    import json
    from pathlib import Path
    path = Path(__file__).resolve().parent / "data" / "vessels.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(500, f"Unable to load vessel data: {exc}")
    if port:
        p = payload.get("ports", {}).get(port)
        if p is None:
            raise HTTPException(404, "Port not found")
        return {"port": port, "port_info": p, "vessels": payload.get("vessels", [])}
    return payload


# ---------------------------------------------------------------------------
# NEW — Live feeds + FinBERT
# ---------------------------------------------------------------------------

@app.get("/api/live-feed")
def live_feed():
    """Fetch live freight news, world-market snapshots and marine weather."""
    payload = get_live_feed()
    payload["finbert"] = analyze_news(payload.get("news", []))
    return payload


@app.post("/api/finbert")
def finbert(body: FinBERTIn):
    """Run FinBERT on supplied text or a list of news objects."""
    if body.items is not None:
        return analyze_news(body.items)
    if body.text is None:
        raise HTTPException(400, "Provide either text or items")
    return analyze_news([{"title": body.text}])


# ---------------------------------------------------------------------------
# What-if
# ---------------------------------------------------------------------------

@app.post("/api/what-if")
def what_if(body: WhatIfIn):
    """Compare manager preference vs AI best under same constraints + charter view."""
    # What-if is intentionally unconstrained by the selected origin. The manager
    # choice is evaluated as-is (even when that combination is operationally
    # infeasible), while the AI scans every configured origin × destination port.
    try:
        selected = evaluate_route(
            material=body.material,
            origin=body.origin,
            port=body.port,
            plant_code=body.plant_code,
            quantity_mt=body.quantity_mt,
            priority_cost=body.priority,
            deadline_days=body.deadline_days,
            min_quality_index=body.min_quality_index,
        )
    except ValueError as exc:
        selected = {
            "origin": body.origin,
            "port": body.port,
            "origin_label": source_ports().get(body.origin, {}).get("country", body.origin),
            "port_label": destination_ports().get(body.port, {}).get("name", body.port),
            "material": body.material,
            "material_label": materials().get(body.material, {}).get("name", body.material),
            "capable": False,
            "physical_feasibility": [str(exc)],
            "total_cost_mt": None,
            "total_cost": None,
            "eta_days": None,
            "risk_score": None,
            "quality_index": None,
        }
    ranking = rank_ports(
        material=body.material,
        plant_code=body.plant_code,
        quantity_mt=body.quantity_mt,
        origin=None,
        priority_cost=body.priority,
        deadline_days=body.deadline_days,
        min_quality_index=body.min_quality_index,
        all_origins=True,
    )
    best = ranking.get("best")

    # Charter for both paths
    from datetime import date, timedelta
    dl = (date.today() + timedelta(days=int(body.deadline_days or 45))).isoformat()
    plabel = "cost" if body.priority < 40 else ("time" if body.priority > 65 else "balanced")
    manager_origin = body.origin or "australia"
    ai_origin = (best or {}).get("origin") or manager_origin

    charter_ai = recommend_charter_strategy(
        origin=ai_origin,
        dest_port=(best or {}).get("port") or body.port or "paradip",
        cargo_mt=body.quantity_mt,
        deadline=dl,
        priority=plabel,
    )
    charter_mgr = recommend_charter_strategy(
        origin=manager_origin,
        dest_port=body.port or "paradip",
        cargo_mt=body.quantity_mt,
        deadline=dl,
        priority=plabel,
    )

    def eta_status(eta, deadline):
        try:
            d = float(deadline) - float(eta)
        except Exception:
            return "—"
        if d >= 2:
            return f"Arrives {d:.0f} days BEFORE deadline"
        if d >= 0:
            return "Arrives ON TIME"
        return f"Arrives {abs(d):.0f} days LATE"

    base = selected or {}
    alt = best or {}
    diff = {}
    if base and alt:
        base_cost = float(base.get("total_cost_mt") or base.get("total_cost") or 0)
        alt_cost = float(alt.get("total_cost_mt") or alt.get("total_cost") or 0)
        base_eta = float(base.get("eta_days") or 0)
        alt_eta = float(alt.get("eta_days") or 0)
        base_risk = float(base.get("risk_score") or 0)
        alt_risk = float(alt.get("risk_score") or 0)
        qty = float(body.quantity_mt or 1)
        diff = {
            "cost_delta_mt": round(alt_cost - base_cost, 1),
            "cost_delta_total": round((alt_cost - base_cost) * qty, 0),
            "time_delta_days": round(alt_eta - base_eta, 1),
            "risk_delta": round(alt_risk - base_risk, 1),
            "manager_cheaper": base_cost <= alt_cost,
            "ai_faster": alt_eta <= base_eta,
            "savings_if_ai_pct": round((base_cost - alt_cost) / base_cost * 100, 1) if base_cost else 0,
        }

    return {
        "base": {
            **base,
            "label": "Manager preference",
            "vessel_class": charter_mgr.get("recommended_vessel_class"),
            "preferred_contract": charter_mgr.get("preferred_contract"),
            "entry_window": charter_mgr.get("entry_window"),
            "eta_status": eta_status(base.get("eta_days"), body.deadline_days),
            "quality_index": base.get("quality_index"),
        },
        "what_if": {
            **alt,
            "label": "AI optimised",
            "vessel_class": charter_ai.get("recommended_vessel_class"),
            "preferred_contract": charter_ai.get("preferred_contract"),
            "entry_window": charter_ai.get("entry_window"),
            "eta_status": eta_status(alt.get("eta_days"), body.deadline_days),
            "quality_index": alt.get("quality_index"),
        },
        "difference": diff,
        "charter": charter_ai,
        "recommendation": {
            "vessel_class": charter_ai.get("recommended_vessel_class"),
            "preferred_contract": charter_ai.get("preferred_contract"),
            "entry_window": charter_ai.get("entry_window"),
            "voyages": charter_ai.get("voyages_needed"),
            "savings_pct": charter_ai.get("expected_savings_pct_vs_spot"),
            "confidence": charter_ai.get("confidence"),
            "contract_comparison": charter_ai.get("contract_comparison"),
            "idle": charter_ai.get("idle_positioning_advice", [])[:2],
            "risk_flags": charter_ai.get("risk_flags", []),
        },
        "deadline_days": body.deadline_days,
    }


# ---------------------------------------------------------------------------
# Executive report
# ---------------------------------------------------------------------------

@app.get("/api/executive-report")
def executive_report(plant_code: str = "RSP"):
    risk = network_risk_score()
    cons = load_consignments().get("items", [])
    active = [c for c in cons if str(c.get("status", "")).lower() not in ("delivered", "future")]
    delayed = [c for c in cons if str(c.get("status", "")).lower() == "delayed"]
    inv = inventory(plant_code)["items"]
    watch = sum(1 for i in inv if i["urgency_index"] >= 5)

    decisions = []
    for c in delayed:
        decisions.append(f"Review recovery path for {c['id']} ({c.get('delay_days')}d late)")
    for i in inv:
        if i["urgency_index"] >= 8:
            decisions.append(f"Prioritise {i['material']} booking — cover critical")
    if risk["risk_level"] != "green":
        decisions.append("Maintain heightened watch on Bay of Bengal weather & ETAs")
    fc = forecast_bdi(30)
    if fc["booking_window"]["expected_savings_percent"] >= 3:
        decisions.append(
            f"Consider freight booking window around day {fc['booking_window']['best_day']} "
            f"(~{fc['booking_window']['expected_savings_percent']}% rate relief)"
        )
    if not decisions:
        decisions.append("No critical actions — continue routine monitoring")

    return {
        "summary": {
            "network_risk": risk["risk_score"],
            "active_consignments": len(active),
            "delayed_consignments": len(delayed),
            "inventory_watch": watch,
        },
        "decisions": decisions[:6],
        "generated_on": date.today().isoformat(),
        "plant": plants().get(plant_code, {}).get("name", plant_code),
    }


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

@app.post("/api/reload-data")
def reload_data():
    """Force re-read of all JSON data files (useful after manual updates)."""
    reload_all()
    return {"status": "ok", "message": "Data cache cleared"}



@app.get("/api/multi-forecast")
def multi_forecast(horizon: int = Query(60, ge=30, le=120)):
    """Vessel-class and trade-lane specific rate forecast proxies."""
    return ml_size_route_forecast(horizon)


@app.post("/api/charter-strategy")
def charter_strategy(body: dict):
    """
    Core chartering recommendation: entry timing, vessel class,
    spot vs multi-voyage COA vs short TC, idle advice.
    """
    return recommend_charter_strategy(
        origin=body.get("origin", "australia"),
        dest_port=body.get("dest_port", "paradip"),
        cargo_mt=float(body.get("cargo_mt", 70000)),
        deadline=body.get("deadline"),
        priority=body.get("priority", "cost"),
        vessel_class_hint=body.get("vessel_class"),
    )


def _days_from_deadline(deadline: Optional[str]) -> Optional[float]:
    if not deadline:
        return None
    try:
        return max(1, (date.fromisoformat(str(deadline)[:10]) - date.today()).days)
    except Exception:
        return None


@app.post("/api/procurement-report")
def procurement_report(body: dict):
    """
    Generate a downloadable-style official plan document for manager sign-off.
    Returns structured content that frontend can render / print as PDF-like report.
    """
    from datetime import datetime
    origin = body.get("origin", "australia")
    material = body.get("material", "coking_coal")
    qty = float(body.get("quantity", 70000))
    deadline = body.get("deadline")
    priority = body.get("priority", "cost")
    plant = body.get("plant_code", "RSP")
    manager_name = body.get("manager_name", "R. Sharma")

    dest = body.get("port", "paradip")
    strat = recommend_charter_strategy(origin, dest, qty, deadline, priority)
    # Cost breakdown from route engine
    cost_break = {}
    voyage_schedule = []
    try:
        from services.route_optimizer import evaluate_route, procurement_plan
        route = evaluate_route(material, origin, dest, plant, qty, 55 if priority == "cost" else 70, deadline_days=_days_from_deadline(deadline))
        plan_data = procurement_plan(material, qty, _days_from_deadline(deadline) or 45, dest, plant, 55 if priority == "cost" else 70, origin)
        cost_break = {
            "sea_freight_mt": route.get("freight_inr_mt") or route.get("sea_freight_inr_mt"),
            "port_handling_mt": route.get("handling_inr_mt"),
            "port_charges_mt": route.get("port_charges_inr_mt"),
            "inland_to_plant_mt": route.get("inland_inr_mt"),
            "fob_mt": route.get("fob_inr_mt") or route.get("fob_usd_mt"),
            "other_charges_mt": route.get("other_charges_inr_mt", 0),
            "total_cost_mt": route.get("total_cost_mt"),
            "total_cost": route.get("total_cost"),
            "eta_days": route.get("eta_days"),
            "risk_score": route.get("risk_score"),
            "origin_label": route.get("origin_label"),
            "port_label": route.get("port_label"),
            "currency_note": "Component rates in INR/MT where available",
        }
        voyages = int(strat.get("voyages_needed") or 1)
        parcel = qty / max(1, voyages)
        eta0 = float(route.get("eta_days") or 30)
        for i in range(voyages):
            voyage_schedule.append({
                "voyage": i + 1,
                "approx_tonnage_mt": round(parcel, 0),
                "approx_eta_days": round(eta0 + i * max(8, eta0 * 0.15), 1),
            })
    except Exception:
        pass
    report = {
        "title": "FreightOne — Official Procurement & Chartering Plan",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "manager_name": manager_name,
        "plant_code": plant,
        "request": {
            "material": material,
            "quantity_mt": qty,
            "origin": origin,
            "destination_port": dest,
            "deadline": deadline,
            "priority": priority,
        },
        "recommendation": {
            "preferred_contract": strat["preferred_contract"],
            "vessel_class": strat["recommended_vessel_class"],
            "voyages": strat["voyages_needed"],
            "entry_window": strat["entry_window"],
            "best_entry_date": strat["best_entry_date"],
            "expected_savings_pct": strat["expected_savings_pct_vs_spot"],
            "reason": strat["reason"],
        },
        "cost_breakdown": cost_break,
        "cost_summary": strat["cost_comparison"],
        "voyage_schedule": voyage_schedule,
        "route_plan": [
            {"route_rank": i + 1, "origin": r["origin"], "port": r["port"], "allocation_mt": r["allocation_mt"], "reason": r.get("reason")}
            for i, r in enumerate(plan_data.get("route_plan", []) if isinstance(plan_data, dict) else [])
        ],
        "risk_flags": strat["risk_flags"],
        "idle_advice": strat.get("idle_positioning_advice", []),
        "idle_positioning": strat.get("idle_positioning"),
        "contract_comparison": strat.get("contract_comparison"),
        "confidence": strat.get("confidence"),
        "signature_block": {
            "prepared_by": "FreightOne Decision Support",
            "manager_name": manager_name,
            "designation": "Bulk Procurement / Chartering",
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "signature_line": "_______________________________"
        },
        "disclaimer": "This plan is generated by the FreightOne predictive model for decision support. Final fixture remains subject to commercial negotiation and operational confirmation."
    }
    return report


@app.get("/api/security/plant-access")
def security_plant_access_info():
    """Demo metadata for two-layer plant protection (judges / UI prefill)."""
    return plant_access_demo_hints()


@app.post("/api/security/verify-plant")
def security_verify_plant(body: dict):
    """Layer-2 verification used by Procurement & Consignment Tracker."""
    plant_code = str(body.get("plant_code") or "").strip().upper()
    access_code = str(body.get("access_code") or body.get("plant_access_code") or "").strip().upper()
    ok = verify_plant_access(plant_code, access_code)
    if not ok:
        raise HTTPException(status_code=403, detail="Invalid plant access code.")
    return {"ok": True, "plant_code": plant_code, "layer": 2}


@app.get("/api/ml-forecast")
def api_ml_forecast(horizon: int = Query(90, ge=30, le=120), material: str = "coking_coal"):
    """ML multi-feature forecast (commodity/macro/lags/seasonality + optional live blend)."""
    return ml_forecast(horizon_days=horizon, material=material)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "FreightOne", "version": "5.0.0", "data_mode": "JSON demo data"}
