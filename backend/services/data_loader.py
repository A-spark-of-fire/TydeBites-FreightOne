"""
Central data loader for FreightOne.
All JSON data files live in backend/data/.
This module is the single place to read / refresh operational data so that
updating real data later only requires changing the JSON files (or swapping
this loader for a DB connection).
"""

from __future__ import annotations
import json
from pathlib import Path
from functools import lru_cache
from typing import Any, Dict, List

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load(name: str) -> Any:
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Data file missing: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def managers() -> List[Dict]:
    return _load("managers.json")


@lru_cache(maxsize=1)
def materials() -> Dict:
    return _load("materials.json")


@lru_cache(maxsize=1)
def source_ports() -> Dict:
    return _load("source_ports.json")


@lru_cache(maxsize=1)
def destination_ports() -> Dict:
    return _load("destination_ports.json")


@lru_cache(maxsize=1)
def cargo_prices() -> Dict:
    return _load("cargo_prices.json")


@lru_cache(maxsize=1)
def inland_transport() -> Dict:
    return _load("inland_transport.json")


@lru_cache(maxsize=1)
def consignments() -> Dict:
    return _load("consignments.json")


@lru_cache(maxsize=1)
def plants() -> Dict:
    return _load("plants.json")


@lru_cache(maxsize=1)
def bdi_history() -> Dict:
    return _load("bdi_history.json")


@lru_cache(maxsize=1)
def news_feed() -> Dict:
    return _load("news_feed.json")


def load_json(name: str) -> Any:
    """Generic loader for any data file (uncached)."""
    return _load(name)


@lru_cache(maxsize=1)
def size_route_rates() -> Dict:
    return _load("size_route_rates.json")


@lru_cache(maxsize=1)
def commodity_macro() -> Dict:
    return _load("commodity_macro.json")


def reload_all() -> None:
    """Call this if JSON files are updated at runtime (demo refresh)."""
    managers.cache_clear()
    materials.cache_clear()
    source_ports.cache_clear()
    destination_ports.cache_clear()
    cargo_prices.cache_clear()
    inland_transport.cache_clear()
    consignments.cache_clear()
    plants.cache_clear()
    bdi_history.cache_clear()
    news_feed.cache_clear()
    size_route_rates.cache_clear()
    commodity_macro.cache_clear()
