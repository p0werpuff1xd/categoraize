"""Deterministic P1-P5 priority rules (plan section 7). Not a learned model.

level = category base + deadline boost + role boost + calendar boost,
clamped to 1-5; a VIP sender is raised to at least P4.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta

MIN_LEVEL = 1
MAX_LEVEL = 5
VIP_FLOOR = 4
URGENT_WINDOW = timedelta(hours=24)
SOON_WINDOW = timedelta(hours=72)
ROLE_BOOSTS = {
    "director/executive": 2,
    "director": 2,
    "executive": 2,
    "manager": 1,
}


@dataclass(frozen=True)
class PriorityResult:
    level: int
    factors: dict[str, int]
    deadline: datetime | None


def compute_priority(
    *,
    base_priority: int,
    validated_deadlines: Sequence[datetime],
    now: datetime,
    sender_role: str | None,
    is_vip: bool,
    calendar_busy: Sequence[tuple[datetime, datetime]] | None,
) -> PriorityResult:
    deadline = _nearest_deadline(validated_deadlines, now)
    deadline_boost = _deadline_boost(deadline, now)
    role_boost = ROLE_BOOSTS.get((sender_role or "").strip().casefold(), 0)
    # No calendar access means no boost; missing data is never read as "not urgent".
    calendar_boost = 0
    if deadline is not None and calendar_busy:
        calendar_boost = int(any(start <= deadline <= end for start, end in calendar_busy))

    level = _clamp(base_priority + deadline_boost + role_boost + calendar_boost)
    vip_pin = VIP_FLOOR - level if is_vip and level < VIP_FLOOR else 0
    level += vip_pin

    return PriorityResult(
        level=level,
        factors={
            "category_base": base_priority,
            "deadline": deadline_boost,
            "sender_role": role_boost,
            "calendar": calendar_boost,
            "vip_pin": vip_pin,
        },
        deadline=deadline,
    )


def _nearest_deadline(deadlines: Sequence[datetime], now: datetime) -> datetime | None:
    if not deadlines:
        return None
    overdue = [deadline for deadline in deadlines if deadline < now]
    if overdue:
        return max(overdue)
    return min(deadlines)


def _deadline_boost(deadline: datetime | None, now: datetime) -> int:
    if deadline is None:
        return 0
    remaining = deadline - now
    if remaining <= URGENT_WINDOW:
        return 2
    if remaining <= SOON_WINDOW:
        return 1
    return 0


def _clamp(level: int) -> int:
    return max(MIN_LEVEL, min(MAX_LEVEL, level))
