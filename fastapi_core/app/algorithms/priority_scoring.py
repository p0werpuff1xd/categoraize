from dataclasses import dataclass
from enum import StrEnum


class PriorityLevel(StrEnum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"
    P5 = "P5"


@dataclass(frozen=True)
class PriorityResult:
    level: PriorityLevel
    score: float
    factors: dict[str, float]
    weights: dict[str, float]
    dampener: float


RAW_WEIGHTS = {"urgency": 0.40, "deadline": 0.35, "sender": 0.25, "calendar": 0.20}
WEIGHTS = {key: value / sum(RAW_WEIGHTS.values()) for key, value in RAW_WEIGHTS.items()}


def calculate_priority(
    *,
    urgency: float,
    deadline: float,
    sender: float,
    calendar: float,
    dampener: float = 1.0,
) -> PriorityResult:
    factors = {
        "urgency": _bounded(urgency),
        "deadline": _bounded(deadline),
        "sender": _bounded(sender),
        "calendar": _bounded(calendar),
    }
    bounded_dampener = _bounded(dampener)
    score = sum(factors[key] * WEIGHTS[key] for key in WEIGHTS) * bounded_dampener
    level = PriorityLevel(f"P{1 + min(4, int(score * 5))}")
    return PriorityResult(level, score, factors, WEIGHTS, bounded_dampener)


def _bounded(value: float) -> float:
    return max(0.0, min(1.0, value))
