"""FreightOne route, port and source optimisation engine.

The engine keeps the existing JSON data model but makes the decision logic
consistent across Procurement, Port Optimizer, Vessel Optimizer and What-if.
Hard feasibility checks happen before weighted scoring; cost/time/risk and
historical plant-port relationships are then combined into one explainable
score.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .charter_strategy import recommend_charter_strategy
from .data_loader import (
    cargo_prices,
    destination_ports,
    inland_transport,
    materials,
    plants,
    consignments,
    source_ports,
)
from .geo import estimate_sea_days, haversine_nm
from .bdi_forecast import forecast_bdi
from .risk_analyzer import network_risk_score


def _priority_weights(priority: float) -> Dict[str, float]:
    """0 = deadline-first, 100 = cost-first, matching every UI slider."""
    p = max(0.0, min(100.0, float(priority))) / 100.0
    return {"cost": 0.55 * p + 0.05, "time": 0.55 * (1 - p) + 0.05, "risk": 0.25, "history": 0.15}


def _freight_rate_usd_mt(origin_key: str, dest_key: str, material: str, bdi: float) -> float:
    src = source_ports().get(origin_key)
    dst = destination_ports().get(dest_key)
    if not src or not dst:
        return 18.0
    dist = haversine_nm(src["lat"], src["lon"], dst["lat"], dst["lon"])
    base = (bdi / 1400.0) * (8.0 + dist / 900.0)
    if material in ("coking_coal", "thermal_coal"):
        base *= 1.05
    elif material == "iron_ore":
        base *= 0.95
    return round(max(6.0, base), 2)


def _inland_for(port_code: str, plant_code: str) -> Dict[str, Any]:
    key = f"{port_code}_to_{plant_code}"
    data = inland_transport()
    if key in data:
        return data[key]
    port = destination_ports().get(port_code, {})
    link = port.get("inland_to_plants", {}).get(plant_code)
    if link:
        return {
            "rail_transit_days": link.get("rail_days", 3),
            "road_transit_days": link.get("road_days", 4),
            "rail_rate_inr_mt": link.get("rail_rate_per_mt", 450),
            "road_rate_inr_mt": link.get("road_rate_per_mt", 600),
            "rail_distance_km": link.get("distance_km", 500),
            "preferred_mode": "rail",
        }
    return {"rail_transit_days": 4, "road_transit_days": 6, "rail_rate_inr_mt": 500, "road_rate_inr_mt": 650}


def _plant_port_history(plant_code: str, port: str) -> Dict[str, Any]:
    plant = plants().get(plant_code, {})
    history = plant.get("port_relationships", {}).get(port, {})
    return history or {"relationship_index": 0.45, "reliability_index": 0.75, "notes": "No plant-specific history loaded."}


def _date_eta_status(eta_days: float, deadline_days: Optional[float]) -> Dict[str, Any]:
    if deadline_days is None:
        return {"deadline_delta_days": None, "deadline_status": "No deadline supplied"}
    delta = round(float(deadline_days) - float(eta_days), 1)
    if delta >= 1:
        status = f"In time · {delta:g}d before deadline"
    elif delta >= 0:
        status = "In time · within deadline"
    else:
        status = f"Late · {abs(delta):g}d after deadline"
    return {"deadline_delta_days": delta, "deadline_status": status}


def evaluate_route(
    material: str,
    origin: str,
    port: str,
    plant_code: str,
    quantity_mt: float,
    priority_cost: float = 50.0,
    deadline_days: Optional[float] = None,
    min_quality_index: float = 0.0,
) -> Dict[str, Any]:
    mat = materials().get(material)
    src = source_ports().get(origin)
    dst = destination_ports().get(port)
    if not mat:
        raise ValueError(f"Unknown material: {material}")
    if not src:
        raise ValueError(f"Unknown source: {origin}")
    if not dst:
        raise ValueError(f"Unknown destination port: {port}")
    if plant_code not in plants():
        raise ValueError(f"Unknown plant: {plant_code}")

    qty = max(1.0, float(quantity_mt))
    prices = cargo_prices().get(material, {})
    price_row = prices.get(origin, {})
    fob = price_row.get("inr_mt")
    if fob is None:
        fob = float(price_row.get("fob_usd_mt", 100)) * float(cargo_prices().get("fx_usd_inr", 84.0))

    quality_idx = float((src.get("quality_index") or {}).get(material, 0))
    source_capable = material in src.get("primary_cargo", [])
    destination_capable = material in dst.get("handling_capability", [])
    quality_ok = quality_idx >= float(min_quality_index or 0)
    origin_draft = float(src.get("max_draft_m", 14.0))
    origin_dwt = float(src.get("max_dwt", 120000))
    dest_draft = float(dst.get("max_draft_m", 0))
    dest_dwt = float(dst.get("max_vessel_dwt", 0))
    inland = _inland_for(port, plant_code)

    bdi = float(forecast_bdi(5)["indices"]["BDI"])
    freight_usd = _freight_rate_usd_mt(origin, port, material, bdi)
    fx = float(cargo_prices().get("fx_usd_inr", 84.0))
    freight_inr = freight_usd * fx
    rail_inr = float(inland.get("rail_rate_inr_mt", 450))
    handling_inr = 180.0 + float(dst.get("avg_queue_days", 2)) * 25.0
    port_charges = 95.0 + float(dst.get("avg_queue_days", 2)) * 12.0
    other = 35.0 + (12.0 if quality_idx < 80 else 0.0)
    total_per_mt = fob + freight_inr + rail_inr + handling_inr + port_charges + other
    total_cost = total_per_mt * qty

    dist = haversine_nm(src["lat"], src["lon"], dst["lat"], dst["lon"])
    sea_days = float(src.get("typical_transit_days_to_east_coast") or estimate_sea_days(dist))
    queue_days = float(dst.get("avg_queue_days", 2))
    load_rate = float(src.get("loading_rate_mt_per_day", 25000))
    handling_rate = float(dst.get("handling_rate_mt_per_day", 25000))
    load_days = max(1.0, qty / max(5000.0, load_rate))
    discharge_days = max(1.0, qty / max(5000.0, handling_rate))
    inland_days = float(inland.get("rail_transit_days", 4))
    eta_days = sea_days + load_days + queue_days + discharge_days + inland_days

    risk_base = float(network_risk_score()["risk_score"])
    congestion_risk = min(100.0, queue_days * 18.0)
    relation = _plant_port_history(plant_code, port)
    relation_risk = (1.0 - float(relation.get("reliability_index", 0.75))) * 35.0
    quality_risk = max(0.0, (90.0 - quality_idx) * 0.5)
    risk_score = max(5.0, min(95.0, 0.40 * risk_base + 0.30 * congestion_risk + 0.15 * relation_risk + 0.15 * quality_risk))

    capability_reasons = []
    if not source_capable:
        capability_reasons.append("Source does not list this material as a primary cargo")
    if not destination_capable:
        capability_reasons.append("Destination cannot handle this material")
    if not quality_ok:
        capability_reasons.append(f"Quality index {quality_idx:.0f} below required {float(min_quality_index):.0f}")
    physically_possible = source_capable and destination_capable and quality_ok

    deadline_meta = _date_eta_status(eta_days, deadline_days)
    deadline_pass = deadline_days is None or eta_days <= float(deadline_days)

    return {
        "material": material,
        "material_label": mat.get("name", material),
        "origin": origin,
        "origin_label": src.get("country", origin),
        "source_port": src.get("port_name"),
        "port": port,
        "port_label": dst.get("name", port),
        "plant_code": plant_code,
        "quantity_mt": qty,
        "fob_inr_mt": round(fob, 1),
        "freight_inr_mt": round(freight_inr, 1),
        "inland_inr_mt": round(rail_inr, 1),
        "handling_inr_mt": round(handling_inr, 1),
        "port_charges_inr_mt": round(port_charges, 1),
        "other_charges_inr_mt": round(other, 1),
        "total_cost_mt": round(total_per_mt, 1),
        "total_cost": round(total_cost),
        "sea_days": round(sea_days, 1),
        "load_days": round(load_days, 1),
        "queue_days": round(queue_days, 1),
        "discharge_days": round(discharge_days, 1),
        "inland_days": round(inland_days, 1),
        "eta_days": round(eta_days, 1),
        "deadline_delta_days": deadline_meta["deadline_delta_days"],
        "deadline_status": deadline_meta["deadline_status"],
        "deadline_pass": deadline_pass,
        "risk_score": round(risk_score),
        "historic_preference": float(dst.get("historic_preference", {}).get(material, 0.2)),
        "plant_port_relationship": relation,
        "capable": physically_possible,
        "source_capable": source_capable,
        "destination_capable": destination_capable,
        "quality_ok": quality_ok,
        "quality_index": round(quality_idx),
        "congestion": dst.get("typical_congestion", "Medium"),
        "max_draft_m": dest_draft,
        "max_vessel_dwt": dest_dwt,
        "origin_max_draft_m": origin_draft,
        "origin_max_dwt": origin_dwt,
        "origin_max_loa_m": src.get("max_loa_m"),
        "origin_max_beam_m": src.get("max_beam_m"),
        "origin_loading_rate": load_rate,
        "origin_queue_days": float(src.get("typical_queue_days", 2)),
        "quality_penalty": round(max(0, (85 - quality_idx) / 100), 3),
        "load_days_est": round(load_days, 1),
        "physical_feasibility": capability_reasons or ["Cargo, source quality and destination handling checks passed."],
    }


def _score_candidates(candidates: List[Dict[str, Any]], priority: float, deadline_days: Optional[float]) -> None:
    weights = _priority_weights(priority)
    costs = [x["total_cost_mt"] for x in candidates]
    times = [x["eta_days"] for x in candidates]
    risks = [x["risk_score"] for x in candidates]
    cmin, cmax = min(costs), max(costs)
    tmin, tmax = min(times), max(times)
    rmin, rmax = min(risks), max(risks)
    for row in candidates:
        nc = (row["total_cost_mt"] - cmin) / max(1e-6, cmax - cmin)
        nt = (row["eta_days"] - tmin) / max(1e-6, tmax - tmin)
        nr = (row["risk_score"] - rmin) / max(1e-6, rmax - rmin)
        history = float(row.get("plant_port_relationship", {}).get("relationship_index", 0.45))
        score = 100 * (1 - (weights["cost"] * nc + weights["time"] * nt + weights["risk"] * nr + weights["history"] * (1 - history)))
        if deadline_days is not None and not row["deadline_pass"]:
            # Missing the deadline is a hard decision penalty, not a tiny nudge.
            lateness = abs(float(row["deadline_delta_days"] or 0))
            score -= min(45, 20 + lateness * 1.5)
        row["score"] = round(max(0, min(100, score)), 1)


def rank_sources(material: str, plant_code: str, quantity_mt: float, destination_port: Optional[str] = None,
                 deadline_days: Optional[float] = None, min_quality_index: float = 0.0,
                 priority_cost: float = 50.0) -> Dict[str, Any]:
    mat = materials().get(material)
    if not mat:
        raise ValueError(f"Unknown material: {material}")
    dests = [destination_port] if destination_port else list(destination_ports())
    rows = []
    for origin in mat.get("preferred_origins", list(source_ports())):
        if origin not in source_ports():
            continue
        best_for_origin = None
        for dest in dests:
            try:
                r = evaluate_route(material, origin, dest, plant_code, quantity_mt, priority_cost, deadline_days, min_quality_index)
            except ValueError:
                continue
            if best_for_origin is None or (r["deadline_pass"], -r["quality_index"], r["total_cost_mt"]) > (best_for_origin["deadline_pass"], -best_for_origin["quality_index"], best_for_origin["total_cost_mt"]):
                best_for_origin = r
        if best_for_origin:
            rows.append(best_for_origin)
    if rows:
        _score_candidates(rows, priority_cost, deadline_days)
        rows.sort(key=lambda r: (-r["score"], r["total_cost_mt"], r["eta_days"]))
        for i, r in enumerate(rows, 1):
            r["rank"] = i
            r["rank_label"] = "best" if i == 1 else "alternative"
    return {"options": rows, "best": rows[0] if rows else None, "count": len(rows), "min_quality_index": min_quality_index}


def rank_ports(material: str, plant_code: str, quantity_mt: float, origin: Optional[str] = None,
               priority_cost: float = 50.0, deadline_days: Optional[float] = None,
               min_quality_index: float = 0.0, all_origins: bool = False) -> Dict[str, Any]:
    mat = materials().get(material)
    if not mat:
        raise ValueError(f"Unknown material: {material}")
    # Normal optimizer behavior remains origin-constrained. What-if can explicitly
    # request a full network scan across every configured source origin.
    origins = list(source_ports()) if all_origins else ([origin] if origin else mat.get("preferred_origins", list(source_ports())))
    candidates = []
    rejected = []
    for o in origins:
        if o not in source_ports():
            continue
        for p in destination_ports():
            try:
                r = evaluate_route(material, o, p, plant_code, quantity_mt, priority_cost, deadline_days, min_quality_index)
            except ValueError:
                continue
            if not r["capable"]:
                rejected.append(r)
            else:
                candidates.append(r)
    if not candidates:
        return {"options": [], "best": None, "selected": None, "rejected": rejected,
                "count": 0, "weights": _priority_weights(priority_cost),
                "source_constraints_checked": True, "destination_constraints_checked": True}
    _score_candidates(candidates, priority_cost, deadline_days)
    candidates.sort(key=lambda r: (-r["score"], r["total_cost_mt"], r["eta_days"]))
    for i, r in enumerate(candidates, 1):
        r["rank"] = i
        r["rank_label"] = "best" if i == 1 else ("alternative" if i == 2 else "candidate")
    best = candidates[0]
    return {
        "options": candidates,
        "best": best,
        "count": len(candidates),
        "rejected": rejected,
        "weights": _priority_weights(priority_cost),
        "source_constraints_checked": True,
        "destination_constraints_checked": True,
    }


def procurement_plan(material: str, quantity_mt: float, deadline_days: float, preferred_port: Optional[str],
                     plant_code: str, priority: float = 55.0, origin: Optional[str] = None,
                     min_quality_index: float = 0.0) -> Dict[str, Any]:
    # Keep the manager's selected origin constrained for the manual preference,
    # but use the same network-wide AI ranking as What-if for the recommended path.
    ranking = rank_ports(material, plant_code, quantity_mt, origin, priority, deadline_days, min_quality_index)
    options = ranking["options"]
    selected = next((o for o in options if preferred_port and o["port"] == preferred_port), None) or ranking["best"]
    if not selected:
        rejected = ranking.get("rejected", [])
        source_issue = next((r for r in rejected if r.get("origin") == origin and not r.get("source_capable")), None)
        if source_issue:
            raise ValueError(
                f"No procurement route is available from {source_issue.get('origin_label', origin)} for {source_issue.get('material_label', material)}. "
                f"This origin is not configured to supply the selected material."
            )
        quality_issue = next((r for r in rejected if r.get("origin") == origin and not r.get("quality_ok")), None)
        if quality_issue:
            raise ValueError(
                f"No procurement route is available from {quality_issue.get('origin_label', origin)} for {quality_issue.get('material_label', material)} at the selected quality threshold. "
                f"Source quality index is {quality_issue.get('quality_index', '—')} while the required minimum is {float(min_quality_index or 0):.0f}."
            )
        raise ValueError(
            f"No feasible procurement route is available for {materials().get(material, {}).get('name', material)} "
            f"from {source_ports().get(origin, {}).get('country', origin)} to the selected destination under the current constraints."
        )

    # The AI recommendation must be identical to the AI path used by What-if.
    # This keeps the two modules numerically and operationally consistent while
    # preserving the selected-origin manager path above.
    ranking = rank_ports(
        material, plant_code, quantity_mt, origin=None,
        priority_cost=priority, deadline_days=deadline_days,
        min_quality_index=min_quality_index, all_origins=True,
    )
    options_ai = ranking["options"]
    best = ranking["best"]

    plant = plants()[plant_code]
    inv = plant.get("inventory", {}).get(material, {})
    daily = float(materials()[material].get("typical_daily_consumption", 5000))
    stock = float(inv.get("stock_mt", 0))
    safety = float(inv.get("safety_stock_mt", daily * materials()[material].get("safety_days", 6)))
    incoming = sum(float(c.get("tonnage", 0)) for c in consignments().get("items", [])
                   if c.get("plant_code") == plant_code and c.get("material") == material
                   and str(c.get("status", "")).lower() not in ("delivered", "future"))
    effective_cover = (stock + incoming * 0.70) / daily if daily else 0
    safety_days = float(materials()[material].get("safety_days", 6))
    urgency = 9 if effective_cover <= safety_days * 0.5 else 7 if effective_cover <= safety_days else 5 if effective_cover <= safety_days * 1.5 else 3 if effective_cover <= safety_days * 2.5 else 1
    if stock < safety:
        urgency = min(10, urgency + 1)

    deadline_iso = (date.today() + timedelta(days=max(1, int(deadline_days)))).isoformat()
    label = "cost" if priority < 40 else "time" if priority > 65 else "balanced"
    charter = recommend_charter_strategy(origin=best["origin"], dest_port=best["port"], cargo_mt=quantity_mt, deadline=deadline_iso, priority=label, vessel_class_hint=None)

    # Multi-route contingency: only split when a second route materially improves deadline/risk.
    route_plan = [{"route_rank": 1, "origin": best["origin"], "port": best["port"], "allocation_mt": round(quantity_mt, 0), "reason": "Primary AI route."}]
    if len(options_ai) > 1 and (not best["deadline_pass"] or best["risk_score"] >= 65):
        alt = options_ai[1]
        if alt["deadline_pass"] and alt["risk_score"] + 8 < best["risk_score"]:
            split = round(quantity_mt * 0.35, 0)
            route_plan = [
                {"route_rank": 1, "origin": best["origin"], "port": best["port"], "allocation_mt": round(quantity_mt - split, 0), "reason": "Primary route retains most volume."},
                {"route_rank": 2, "origin": alt["origin"], "port": alt["port"], "allocation_mt": split, "reason": "Contingency allocation reduces deadline/risk exposure."},
            ]

    delta = round(float(deadline_days) - float(best["eta_days"]), 1)
    eta_status = "In time" if delta >= 0 else "Late"
    ai = {
        "preferred_port": best["port_label"], "preferred_port_code": best["port"],
        "origin_label": best["origin_label"], "origin": best["origin"], "quantity_mt": quantity_mt,
        "urgency_index": urgency, "days_of_cover": round(effective_cover, 1), "stock_mt": stock, "incoming_mt": incoming,
        "recommendation": "Instant ordering — deadline/stock pressure is high; enter the market now." if urgency >= 8 or deadline_days < 18 else "Optimise the entry window and lock multi-voyage cover where the programme supports it.",
        "vessel_class": charter.get("recommended_vessel_class"), "voyages_needed": charter.get("voyages_needed"),
        "preferred_contract": charter.get("preferred_contract"), "entry_window": charter.get("entry_window"),
        "best_entry_date": charter.get("best_entry_date"), "expected_savings_pct": charter.get("expected_savings_pct_vs_spot"),
        "eta_days": best["eta_days"], "eta_delta_days": delta,
        "eta_status": f"Arrives {delta:g} days before deadline" if delta >= 0 else f"Arrives {abs(delta):g} days late",
        "idle_advice": charter.get("idle_positioning_advice", []), "risk_flags": charter.get("risk_flags", []),
        "cost_comparison": charter.get("cost_comparison", {}), "charter_reason": charter.get("reason"),
        "route_plan": route_plan,
    }
    return {
        "selected": selected, "best_overall": best, "options": options[:6], "ai": ai, "charter": charter,
        "deadline_days": deadline_days, "priority": priority, "plant": plant.get("name", plant_code),
        "eta_status": eta_status, "eta_delta_days": delta, "source_ranking": rank_sources(material, plant_code, quantity_mt, preferred_port, deadline_days, min_quality_index, priority)["options"][:5],
        "route_plan": route_plan,
    }
