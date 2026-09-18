"""Vessel sizing optimiser with origin + destination constraint checks."""
from __future__ import annotations
import json, math
from pathlib import Path
from typing import Any, Dict, Optional
from .data_loader import destination_ports, source_ports
from .charter_strategy import recommend_charter_strategy

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_vessels():
    return json.loads((DATA_DIR / "vessel_optimizer_data.json").read_text(encoding="utf-8")).get("vessels", [])


def _resolve_port(port_id: str):
    key = str(port_id or "").strip().lower()
    aliases = {"visakhapatnam": "vizag", "visakhapatnam port": "vizag", "paradip port": "paradip", "gangavaram port": "gangavaram", "haldia port": "haldia", "sandheads": "sagar", "sagar/sandheads": "sagar"}
    key = aliases.get(key, key)
    ports = destination_ports()
    if key in ports: return key, ports[key]
    for k, v in ports.items():
        if str(v.get("name", "")).lower() == key: return k, v
    raise ValueError(f"Destination port '{port_id}' not found")


def _resolve_origin(origin: Optional[str]):
    key = str(origin or "").strip().lower().replace(" ", "_")
    data = source_ports()
    if key not in data:
        raise ValueError(f"Source '{origin}' not found")
    return key, data[key]


def _score_norm(value, low, high):
    if high - low <= 1e-9: return 1.0
    return max(0.0, min(1.0, (high - value) / (high - low)))


def optimize_vessels(port="paradip", quantity_mt=80000, deadline_days=30, origin="australia", material="coking_coal", priority=55, **kwargs):
    port_id, p = _resolve_port(port)
    origin_id, src = _resolve_origin(origin)
    qty = max(1.0, float(quantity_mt))
    deadline = max(1.0, float(deadline_days or 30))
    priority = max(0.0, min(100.0, float(priority)))
    min_quality = max(0.0, float(kwargs.get("min_quality_index", 0)))

    berth = json.loads((DATA_DIR / "vessel_optimizer_data.json").read_text(encoding="utf-8")).get("port_constraints", {}).get(port_id, {})
    max_draft = float(p.get("max_draft_m", 0))
    max_dwt = float(p.get("max_vessel_dwt", 0))
    max_loa = float(berth.get("max_loa_m", p.get("max_loa_m", 0)) or 0)
    max_beam = float(berth.get("max_beam_m", p.get("max_beam_m", 0)) or 0)
    max_air_draft = float(berth.get("max_air_draft_m", p.get("max_air_draft_m", 0)) or 0)
    origin_max_draft = float(src.get("max_draft_m", 0))
    origin_max_dwt = float(src.get("max_dwt", 0))
    origin_max_loa = float(src.get("max_loa_m", 0))
    origin_max_beam = float(src.get("max_beam_m", 0))
    origin_max_air_draft = float(src.get("max_air_draft_m", 0) or 0)
    handling = max(1.0, float(p.get("handling_rate_mt_per_day", 30000)))
    queue_days = max(0.0, float(p.get("avg_queue_days", 0)))
    berths = max(1.0, float(p.get("berth_capacity", 1)))
    loading = max(5000.0, float(src.get("loading_rate_mt_per_day", 25000)))
    origin_queue = float(src.get("typical_queue_days", 2))

    rows = []
    for v in _load_vessels():
        cap = float(v["capacity_mt"]); dwt = float(v.get("dwt_mt", cap)); draft = float(v["draft_m"]); loa = float(v.get("loa_m", 0)); beam = float(v.get("beam_m", 0)); speed = max(1.0, float(v.get("speed_knots", 13))); sea_rate = float(v.get("sea_rate_per_mt", 0)); charter_day = float(v.get("charter_usd_day", 0))
        air_draft = float(v.get("air_draft_m", 0) or 0)
        fits = {"origin_draft": draft <= origin_max_draft if origin_max_draft else True,
                "destination_draft": draft <= max_draft if max_draft else True,
                "origin_air_draft": air_draft <= origin_max_air_draft if origin_max_air_draft else True,
                "destination_air_draft": air_draft <= max_air_draft if max_air_draft else True,
                "origin_dwt": dwt <= origin_max_dwt if origin_max_dwt else True,
                "destination_dwt": dwt <= max_dwt if max_dwt else True,
                "origin_loa": loa <= origin_max_loa if origin_max_loa else True,
                "destination_loa": loa <= max_loa if max_loa else True,
                "origin_beam": beam <= origin_max_beam if origin_max_beam else True,
                "destination_beam": beam <= max_beam if max_beam else True}
        reasons = []
        for k, ok in fits.items():
            if not ok: reasons.append(k.replace("_", " ").title() + " limit exceeded")
        trips = max(1, math.ceil(qty / cap))
        sailing = float(src.get("typical_transit_days_to_east_coast", 18)) * 13.0 / speed
        load_days = qty / loading
        discharge_days = qty / handling
        queue = queue_days * (trips / berths)
        eta = sailing + load_days + discharge_days + queue + origin_queue
        sea_cost = qty * sea_rate * float(src.get("base_sea_rate_multiplier", 1.0))
        port_cost = qty * (0.22 + queue_days * 0.015)
        charter_cost = charter_day * eta * trips
        total = sea_cost + port_cost + charter_cost
        rows.append({
            "id": v.get("id"), "name": v["name"], "class": v["class"], "vessel_class": v["class"],
            "capacity_mt": round(cap), "dwt": round(dwt), "dwt_mt": round(dwt), "draft_m": draft, "loa_m": loa, "beam_m": beam, "air_draft_m": air_draft,
            "shipments_needed": trips, "utilisation_pct": round(qty / (trips * cap) * 100, 1), "sailing_days": round(sailing, 1),
            "loading_days": round(load_days, 1), "discharge_days": round(discharge_days, 1), "port_turnaround_days": round(discharge_days + queue, 1),
            "eta_days": round(eta, 1), "deadline_delta_days": round(deadline - eta, 1), "deadline_pass": eta <= deadline,
            "sea_cost": round(sea_cost), "port_cost": round(port_cost), "charter_cost": round(charter_cost), "handling_cost": round(port_cost),
            "total_cost": round(total), "cost_per_mt": round(total / qty, 2), "feasible": not reasons,
            "reason": "Fits origin and destination physical constraints." if not reasons else "; ".join(reasons), "fit": fits,
            "origin": origin_id, "port": port_id,
        })

    feasible = [r for r in rows if r["feasible"]]
    rejected = [r for r in rows if not r["feasible"]]
    if feasible:
        costs = [r["cost_per_mt"] for r in feasible]; etas = [r["eta_days"] for r in feasible]; risks = []
        for r in feasible:
            congestion = min(100, queue_days * 18)
            risks.append(congestion)
        for r, risk in zip(feasible, risks):
            cost_component = _score_norm(r["cost_per_mt"], min(costs), max(costs))
            time_component = _score_norm(r["eta_days"], min(etas), max(etas))
            deadline_component = 1.0 if r["deadline_pass"] else max(0.0, 1.0 - abs(r["deadline_delta_days"]) / deadline)
            utilisation = max(0.0, 1.0 - abs(r["utilisation_pct"] - 85) / 85)
            # Same slider semantics as route optimiser: 0 deadline, 100 cost.
            cost_w = 0.55 * priority / 100 + 0.05
            time_w = 0.55 * (1 - priority / 100) + 0.05
            score = 100 * (cost_w * cost_component + time_w * (0.75 * time_component + 0.25 * deadline_component) + 0.15 * utilisation)
            if not r["deadline_pass"]: score -= 25
            r["risk_score"] = round(risk)
            r["optimisation_score"] = round(max(0, min(100, score)), 1)
        feasible.sort(key=lambda x: (-x["optimisation_score"], x["cost_per_mt"], x["eta_days"]))
        for i, r in enumerate(feasible, 1): r["rank"] = i
    for r in rejected: r["optimisation_score"] = 0.0; r["risk_score"] = round(min(100, queue_days * 18)); r["rank"] = None

    best = feasible[0] if feasible else None
    charter = recommend_charter_strategy(origin_id, port_id, qty, None, "cost" if priority < 40 else "time" if priority > 65 else "balanced", best.get("class") if best else None)
    return {
        "port": p.get("name", port_id), "port_id": port_id, "origin": origin_id, "origin_port": src.get("port_name"),
        "material": material, "quantity_mt": qty, "deadline_days": deadline, "priority": priority,
        "best": best, "ranked": feasible + rejected, "options": feasible, "rejected": rejected,
        "feasible_count": len(feasible),
        "port_constraints": {"max_draft_m": max_draft or None, "max_dwt": max_dwt or None, "max_loa_m": max_loa or None, "max_beam_m": max_beam or None,
                             "handling_rate_mt_per_day": handling, "ships_in_queue": p.get("ships_in_queue", 0), "berths": p.get("berths", p.get("berth_capacity", 0)), "avg_queue_days": queue_days,
                             "origin_max_draft_m": origin_max_draft or None, "origin_max_dwt": origin_max_dwt or None, "origin_max_loa_m": origin_max_loa or None, "origin_max_beam_m": origin_max_beam or None, "origin_max_air_draft_m": origin_max_air_draft or None, "max_air_draft_m": max_air_draft or None,
                             "origin_loading_rate_mt_per_day": loading, "origin_queue_days": origin_queue},
        "vessel_fits": [{"vessel": r["name"], "vessel_class": r["class"], "feasible": r["feasible"], "reason": r["reason"], "fit": r["fit"], "draft_m": r["draft_m"], "loa_m": r["loa_m"], "beam_m": r["beam_m"], "air_draft_m": r.get("air_draft_m"), "dwt": r["dwt"]} for r in feasible + rejected],
        "charter": charter,
        "recommendation": {"vessel_class": charter.get("recommended_vessel_class"), "preferred_contract": charter.get("preferred_contract"), "entry_window": charter.get("entry_window"), "voyages": charter.get("voyages_needed"), "savings_pct": charter.get("expected_savings_pct_vs_spot"), "confidence": charter.get("confidence"), "idle": charter.get("idle_positioning_advice", [])[:2], "risk_flags": charter.get("risk_flags", [])},
        "explainability": {"port_fixed": True, "origin_checked": True, "summary": "Physical limits are screened at both source and destination before vessel cost/time ranking. The cost↔deadline slider is consistent with the other optimisation channels."},
    }

optimise_vessels = optimize_vessels
