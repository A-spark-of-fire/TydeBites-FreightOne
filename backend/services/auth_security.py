"""
Two-layer security for FreightOne
---------------------------------
Layer 1 — Manager login (user_id + password)  → existing /api/login
Layer 2 — Plant access code for sensitive modules:
            • Procurement Planner
            • Consignment Tracker

Demo behaviour:
  Plant access codes are the plant codes themselves (RSP, BSP, VSP, ISP)
  so judges can sign in and see the second gate prefilled.

Production path:
  Replace PLANT_ACCESS_CODES with hashed secrets or IAM plant grants.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from .data_loader import managers, plants


# Demo plant access codes (prefill-friendly for judges)
# Format: plant_code -> access code shown/entered at second gate
PLANT_ACCESS_CODES: Dict[str, str] = {
    "RSP": "RSP",
    "BSP": "BSP",
    "VSP": "VSP",
    "ISP": "ISP",
}


def get_manager_by_credentials(user_id: str, password: str) -> Optional[Dict[str, Any]]:
    for m in managers():
        if m.get("user_id") == user_id and m.get("password") == password:
            return m
    return None


def verify_plant_access(plant_code: str, access_code: str) -> bool:
    if not plant_code or not access_code:
        return False
    expected = PLANT_ACCESS_CODES.get(str(plant_code).upper().strip())
    if expected is None:
        return False
    return str(access_code).strip().upper() == str(expected).strip().upper()


def plant_access_demo_hints() -> Dict[str, Any]:
    """Metadata for plant access layer (codes prefilled from assigned plant)."""
    return {
        "enabled": True,
        "mode": "standard",
        "description": (
            "Two-layer protection: (1) Manager login (2) Plant access code "
            "for Procurement Planner and Consignment Tracker."
        ),
        "codes": [
            {
                "plant_code": k,
                "access_code": v,
                "plant_name": (plants().get(k) or {}).get("name", k),
            }
            for k, v in PLANT_ACCESS_CODES.items()
        ],
        "note": "Access code is issued per plant assignment and prefilled after login.",
    }
