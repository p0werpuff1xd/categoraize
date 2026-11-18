"""Learned P1-P5 priority (logistic regression) with rule guardrails.

Features: the email embedding, sender role (one-hot), VIP flag, whether a TASK
was found, deadline proximity, similarity to the promotions description, and
the predicted register. The model is trained offline (eval/train_models.py) on
the synthetic dataset only. Guardrails run after the model:

- a VIP sender with a TASK is at least P4;
- promotions are capped at P2;
- a manual override wins over everything.

Calendar data is not a feature, so missing calendar data can never lower the
level.
"""

import datetime as dt
from dataclasses import dataclass, field

from ..nlp.date_codes import resolved_datetime
from .linear import LinearModel

ROLES = ("manager", "director/executive", "direct report", "external vendor", "other")
DEADLINE_HORIZON_HOURS = 168.0
VIP_FLOOR = 4
PROMOTION_CAP = 2
PROMOTION_SLUG = "promotions"
_FACTOR_LABELS = {
    "content": "email content (embedding)",
    "role": "sender role",
    "is_vip": "VIP sender",
    "has_task": "has a task",
    "deadline_proximity": "deadline proximity",
    "promo_score": "looks like a promotion",
    "register": "sender tone",
}


@dataclass
class PriorityPrediction:
    level: int
    source: str  # learned | rules
    why: list[dict] = field(default_factory=list)
    guardrails: list[str] = field(default_factory=list)


def deadline_proximity(resolved_values: list[str | None], received: dt.datetime) -> float:
    """0 when there is no usable date; 1 for overdue or now; falls linearly to 0 at one week."""
    best = 0.0
    for value in resolved_values:
        moment = resolved_datetime(value, received.tzinfo)
        if moment is None:
            continue
        hours = (moment - received).total_seconds() / 3600
        score = 1.0 if hours <= 0 else max(0.0, DEADLINE_HORIZON_HOURS - hours) / DEADLINE_HORIZON_HOURS
        best = max(best, score)
    return best


def feature_names(dimension: int) -> list[str]:
    return [
        *(f"embedding_{index}" for index in range(dimension)),
        *(f"role={role}" for role in ROLES),
        "is_vip",
        "has_task",
        "deadline_proximity",
        "promo_score",
        "register=formal",
        "register=casual",
    ]


def features(
    embedding: list[float],
    *,
    sender_role: str | None,
    is_vip: bool,
    has_task: bool,
    deadline_proximity: float,
    promo_score: float,
    register: str,
) -> list[float]:
    role = (sender_role or "other").strip().casefold()
    role = role if role in ROLES else "other"
    return [
        *embedding,
        *(1.0 if role == name else 0.0 for name in ROLES),
        float(is_vip),
        float(has_task),
        deadline_proximity,
        promo_score,
        float(register == "formal"),
        float(register == "casual"),
    ]


def apply_guardrails(
    level: int, *, is_vip: bool, has_task: bool, category: str | None, override: int | None = None
) -> tuple[int, list[str]]:
    applied: list[str] = []
    if is_vip and has_task and level < VIP_FLOOR:
        level, _ = VIP_FLOOR, applied.append("vip_floor")
    if category == PROMOTION_SLUG and level > PROMOTION_CAP:
        level, _ = PROMOTION_CAP, applied.append("promotion_cap")
    if override is not None:
        level, _ = override, applied.append("manual_override")
    return level, applied


def predict(
    model: LinearModel,
    feature_vector: list[float],
    *,
    is_vip: bool,
    has_task: bool,
    category: str | None,
    override: int | None = None,
) -> PriorityPrediction:
    probabilities = model.predict_proba(feature_vector)
    index = max(range(len(probabilities)), key=probabilities.__getitem__)
    level = int(model.classes[index])
    why = explain(model, feature_vector, index)
    level, guardrails = apply_guardrails(level, is_vip=is_vip, has_task=has_task, category=category, override=override)
    return PriorityPrediction(level=level, source="learned", why=why, guardrails=guardrails)


def explain(model: LinearModel, feature_vector: list[float], class_index: int, top: int = 3) -> list[dict]:
    """Top factors by absolute contribution, with the 384 embedding weights grouped as one factor."""
    grouped: dict[str, float] = {}
    for name, value in zip(model.feature_names, model.contributions(feature_vector, class_index), strict=True):
        if name.startswith("embedding_"):
            key = "content"
        elif name.startswith("role="):
            key = "role"
        elif name.startswith("register="):
            key = "register"
        else:
            key = name
        grouped[key] = grouped.get(key, 0.0) + value
    ranked = sorted(grouped.items(), key=lambda item: abs(item[1]), reverse=True)[:top]
    return [{"factor": _FACTOR_LABELS[key], "contribution": round(value, 4)} for key, value in ranked]
