"""Resolve DATE spans to timezone-aware datetimes.

Relative expressions resolve against the message timestamp in the user's
timezone. Date-only phrases get a default due time (end of business). Vague
phrases resolve to a best guess but are flagged ambiguous, so they do not
affect priority until the user confirms them.
"""

import calendar
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import dateparser

from .taglish_cleaner import gloss_time_expression

DEFAULT_DUE_TIME = time(17, 0)


@dataclass(frozen=True)
class ResolvedDate:
    value: datetime | None
    ambiguous: bool


def resolve_date(phrase: str, *, received_at: datetime, timezone: str) -> ResolvedDate:
    zone = ZoneInfo(timezone)
    base = received_at.astimezone(zone)
    text = gloss_time_expression(phrase)
    text, part_of_day = _split_part_of_day(text)
    explicit_time = _explicit_time(text) or _alas_time(text, part_of_day)
    date_text = _ALAS_RE.sub("", _TIME_RE.sub("", text)).strip()

    special = _resolve_special(
        date_text, base, has_time=explicit_time is not None or part_of_day is not None
    )
    if special is not None:
        day, ambiguous = special
    else:
        parsed = _parse_with_dateparser(date_text, base, timezone) if date_text else base
        if parsed is None:
            return ResolvedDate(None, True)
        day = parsed.astimezone(zone)
        ambiguous = _is_numeric_day_month_ambiguous(date_text)

    due_time = explicit_time or part_of_day or DEFAULT_DUE_TIME
    resolved = datetime.combine(day.date(), due_time, tzinfo=zone)
    return ResolvedDate(resolved, ambiguous)


_PART_OF_DAY_TIMES = {
    "morning": time(9, 0),
    "noon": time(12, 0),
    "afternoon": time(15, 0),
    "evening": time(19, 0),
    "night": time(20, 0),
    "midnight": time(23, 59),
}
_TIME_RE = re.compile(
    r"(?:\s*(?:at\s+|@\s*|alas[\s-]+)?(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<meridiem>am|pm|a\.m\.|p\.m\.|nn|n\.n\.))(?![a-z])",
    re.IGNORECASE,
)
_WEEKDAY_INDEX = {name: index for index, name in enumerate(calendar.day_name)}
_WEEKDAY_ABBREVIATIONS = {
    "mon": "monday", "tue": "tuesday", "tues": "tuesday", "wed": "wednesday",
    "thu": "thursday", "thur": "thursday", "thurs": "thursday", "fri": "friday",
}


def _split_part_of_day(text: str) -> tuple[str, time | None]:
    if re.search(r"\btonight\b", text):
        return re.sub(r"\btonight\b", "today", text), time(20, 0)
    if re.search(r"\blater today\b", text):
        return text, None
    for word, value in _PART_OF_DAY_TIMES.items():
        if re.search(rf"\b(?:this\s+)?{word}\b", text):
            return re.sub(rf"\s*\b(?:this\s+)?{word}\b", "", text).strip() or "today", value
    return text, None


def _explicit_time(text: str) -> time | None:
    match = _TIME_RE.search(text)
    if not match:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute") or 0)
    meridiem = match.group("meridiem").casefold().replace(".", "")
    if meridiem == "nn":
        return time(12, minute)
    if hour > 12:
        return None
    if meridiem == "pm" and hour != 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    return time(hour, minute)


# Filipino clock times without am/pm: "alas-3", "alas 10:30".
_ALAS_RE = re.compile(r"\balas[\s-]+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?(?![\d:])", re.IGNORECASE)


def _alas_time(text: str, part_of_day: time | None) -> time | None:
    match = _ALAS_RE.search(text)
    if not match:
        return None
    hour, minute = int(match.group("hour")), int(match.group("minute") or 0)
    if not 1 <= hour <= 12 or minute > 59:
        return None
    if part_of_day is not None:
        # "alas-3 ng hapon" is 3 PM; "alas-8 ng umaga" is 8 AM.
        pm = part_of_day >= time(12, 0)
    else:
        # Without a part of day, office hours: 1-6 is afternoon, 7-11 morning.
        pm = hour <= 6
    if pm and hour != 12:
        hour += 12
    return time(hour, minute)


def _resolve_special(text: str, base: datetime, *, has_time: bool = False) -> tuple[datetime, bool] | None:
    """Expressions dateparser handles poorly or that need an ambiguity flag."""
    text = re.sub(r"^(?:by|on|before|until|the)\s+", "", text.strip(" .,"))
    text = re.sub(r"['’]s$", "", text)  # "this week's" -> "this week"
    today = base.replace(hour=0, minute=0, second=0, microsecond=0)

    if text in {"today", ""}:
        return today, False
    if text == "later today":
        # Vague on its own ("mamaya"); exact with a clock time ("mamayang 3pm").
        return today, not has_time
    if text in {"tomorrow", "the next day"}:
        return today + timedelta(days=1), False
    if text in {"the day after tomorrow", "day after tomorrow"}:
        return today + timedelta(days=2), False
    if text in {"end of day", "end of the day", "eod", "cob"}:
        return today, False
    if text in {"end of week", "end of the week", "eow", "this week"}:
        return today + timedelta(days=(4 - today.weekday()) % 7), text == "this week"
    if text in {"end of month", "end of the month", "this month"}:
        last = calendar.monthrange(today.year, today.month)[1]
        return today.replace(day=last), text == "this month"
    if text == "next week":
        return today + timedelta(days=7 - today.weekday()), True
    if text == "next month":
        first_next = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        return first_next, True

    weekday = re.fullmatch(r"(?:(?P<modifier>next|this|coming)\s+)?(?P<day>[a-z]+)\.?", text)
    if weekday:
        name = _WEEKDAY_ABBREVIATIONS.get(weekday.group("day"), weekday.group("day"))
        if name.capitalize() in _WEEKDAY_INDEX:
            target = _WEEKDAY_INDEX[name.capitalize()]
            days_ahead = (target - today.weekday()) % 7
            modifier = weekday.group("modifier")
            # "Friday" sent on a Friday, or "next Friday", can mean two different weeks.
            ambiguous = days_ahead == 0 or modifier == "next"
            if days_ahead == 0:
                days_ahead = 7
            return today + timedelta(days=days_ahead), ambiguous
    return None


def _parse_with_dateparser(text: str, base: datetime, timezone: str) -> datetime | None:
    return dateparser.parse(
        text,
        languages=["en"],
        settings={
            "RELATIVE_BASE": base.replace(tzinfo=None),
            "PREFER_DATES_FROM": "future",
            "TIMEZONE": timezone,
            "TO_TIMEZONE": timezone,
            "RETURN_AS_TIMEZONE_AWARE": True,
            "DATE_ORDER": "MDY",
        },
    )


def _is_numeric_day_month_ambiguous(text: str) -> bool:
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/\d{2,4})?", text)
    if not match:
        return False
    first, second = int(match.group(1)), int(match.group(2))
    return first <= 12 and second <= 12 and first != second
