import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class DeadlineCandidate:
    source_text: str
    due_date: datetime | None
    confidence: float
    needs_review: bool


@dataclass(frozen=True)
class InstructionCandidate:
    source_text: str
    action: str
    confidence: float


def extract_deadlines(text: str, *, message_at: datetime, timezone: str) -> list[DeadlineCandidate]:
    target_timezone = _load_timezone(timezone)
    local_message_at = message_at.astimezone(target_timezone)
    candidates: list[DeadlineCandidate] = []
    lowered = text.casefold()

    for expression, days in (("tomorrow", 1), ("bukas", 1)):
        if expression in lowered:
            candidates.append(
                DeadlineCandidate(
                    expression,
                    local_message_at + timedelta(days=days),
                    0.95,
                    False,
                )
            )

    explicit = re.search(
        r"\b(?P<month>January|February|March|April|May|June|July|August|September|October|November|December)\s+(?P<day>\d{1,2})(?:,\s*(?P<year>\d{4}))?\b",
        text,
        re.IGNORECASE,
    )
    if explicit:
        year = int(explicit.group("year") or local_message_at.year)
        month = datetime.strptime(explicit.group("month")[:3], "%b").month
        due = datetime(year, month, int(explicit.group("day")), tzinfo=target_timezone)
        candidates.append(DeadlineCandidate(explicit.group(0), due, 0.9, explicit.group("year") is None))

    if "sa biyernes" in lowered:
        days_until_friday = (4 - local_message_at.weekday()) % 7
        candidates.append(
            DeadlineCandidate(
                "sa Biyernes",
                local_message_at + timedelta(days=days_until_friday),
                0.75,
                True,
            )
        )

    return candidates


def extract_instructions(text: str) -> list[InstructionCandidate]:
    patterns = (
        r"\bplease\s+(?P<action>[^.!?]+)",
        r"\bkindly\s+(?P<action>[^.!?]+)",
        r"\bpaki(?:-|‑)?(?P<action>[^.!?]+)",
    )
    results: list[InstructionCandidate] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            action = " ".join(match.group("action").split()).strip()
            if action:
                results.append(InstructionCandidate(match.group(0), action, 0.8))
    return results


def _load_timezone(name: str) -> tzinfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name.upper() == "UTC":
            return UTC
        raise ValueError(f"timezone data is unavailable for {name}") from None
