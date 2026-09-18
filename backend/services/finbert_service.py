"""FinBERT sentiment/risk analysis for freight and geopolitical news.

The transformer is loaded lazily so the existing backend can still boot when
Transformers/model weights are not installed. When available, ProsusAI/finbert
is used; otherwise the service returns a transparent keyword fallback.
"""
from __future__ import annotations

import math
from typing import Any

MODEL_NAME = "ProsusAI/finbert"
_pipeline = None
_load_error = None


def _get_pipeline():
    global _pipeline, _load_error
    if _pipeline is not None or _load_error is not None:
        return _pipeline
    try:
        from transformers import pipeline
        _pipeline = pipeline("text-classification", model=MODEL_NAME, tokenizer=MODEL_NAME)
    except Exception as exc:  # optional dependency/model download
        _load_error = str(exc)
    return _pipeline


NEGATIVE_TERMS = {
    "war": 0.45, "conflict": 0.35, "strike": 0.30, "sanction": 0.25,
    "tariff": 0.18, "closure": 0.35, "closed": 0.35, "storm": 0.30,
    "cyclone": 0.45, "blockade": 0.50, "disruption": 0.30, "congestion": 0.18,
    "attack": 0.45, "crisis": 0.30, "shortage": 0.30, "delay": 0.15,
}


def _fallback(text: str) -> dict[str, Any]:
    t = text.lower()
    score = sum(weight for term, weight in NEGATIVE_TERMS.items() if term in t)
    risk = round(min(100.0, score * 100.0), 1)
    if risk >= 60:
        label = "negative"
    elif risk >= 25:
        label = "neutral"
    else:
        label = "positive"
    return {
        "label": label,
        "score": round(min(1.0, max(0.0, risk / 100)), 4),
        "risk_score": risk,
        "model": "keyword-fallback",
        "model_available": False,
    }


def analyze_text(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return _fallback("")
    clf = _get_pipeline()
    if clf is None:
        return _fallback(text)
    try:
        result = clf(text[:4000], truncation=True)[0]
        label = str(result.get("label", "neutral")).lower()
        confidence = float(result.get("score", 0.0))
        risk = confidence * 100 if label == "negative" else (50 * confidence if label == "neutral" else 0)
        return {
            "label": label,
            "score": round(confidence, 4),
            "risk_score": round(min(100.0, risk), 1),
            "model": MODEL_NAME,
            "model_available": True,
        }
    except Exception:
        return _fallback(text)


def analyze_news(items: list[dict[str, Any]]) -> dict[str, Any]:
    analyzed = []
    for item in items[:30]:
        text = " ".join(str(item.get(k, "")) for k in ("title", "description", "summary", "text"))
        result = analyze_text(text)
        row = dict(item)
        row["finbert"] = result
        analyzed.append(row)
    risks = [x["finbert"]["risk_score"] for x in analyzed]
    avg = round(sum(risks) / len(risks), 1) if risks else 0.0
    return {
        "items": analyzed,
        "aggregate_risk": avg,
        "model": MODEL_NAME,
        "model_available": _get_pipeline() is not None,
        "fallback_reason": _load_error,
    }
