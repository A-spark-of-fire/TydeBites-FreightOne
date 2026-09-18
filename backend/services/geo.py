"""Haversine distance and simple transit helpers."""

from __future__ import annotations
import math
from typing import Tuple


def haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in nautical miles."""
    R = 3440.065  # Earth radius in NM
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def estimate_sea_days(distance_nm: float, speed_kn: float = 12.5) -> float:
    """Rough steaming days at given service speed (bulk carriers ~11-14 kn)."""
    return max(1.0, distance_nm / (speed_kn * 24))
