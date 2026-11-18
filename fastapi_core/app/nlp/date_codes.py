"""Deterministic DATE resolution: phrase -> resolution code -> ISO value.

The resolver is ported from the dataset's authoring library
(data/categoraize-dataset/scripts/dslib.py) so predictions and gold labels use
the same calendar rules:

    +N or +N@HH:MM          N days after the received date
    mon..sun or mon@HH:MM   next such weekday strictly after the received date
    nxt:mon                 that weekday of next calendar week
    YYYY-MM-DD[@HH:MM]      absolute
    ?                       ambiguous (no resolved value)

A date without a stated time stays date-only ("2026-11-19"), so it can never
count as a calendar conflict. Vague phrases ("next week", "soon") are
ambiguous and never count toward conflicts or priority.

The Filipino/Taglish wordlists below were written by the team, not a native
speaker panel, and are pending native-speaker review.
"""

import datetime as dt
import re

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

_WEEKDAY_WORDS = {
    "monday": "mon", "mon": "mon", "lunes": "mon",
    "tuesday": "tue", "tue": "tue", "tues": "tue", "martes": "tue",
    "wednesday": "wed", "wed": "wed", "miyerkules": "wed", "miyerkoles": "wed", "myerkules": "wed",
    "thursday": "thu", "thu": "thu", "thur": "thu", "thurs": "thu", "huwebes": "thu",
    "friday": "fri", "fri": "fri", "biyernes": "fri", "byernes": "fri",
    "saturday": "sat", "sat": "sat", "sabado": "sat",
    "sunday": "sun", "sun": "sun", "linggo": "sun",
}
_MONTH_WORDS = {
    "january": 1, "jan": 1, "enero": 1,
    "february": 2, "feb": 2, "pebrero": 2, "febrero": 2,
    "march": 3, "mar": 3, "marso": 3,
    "april": 4, "apr": 4, "abril": 4,
    "may": 5, "mayo": 5,
    "june": 6, "jun": 6, "hunyo": 6,
    "july": 7, "jul": 7, "hulyo": 7,
    "august": 8, "aug": 8, "agosto": 8,
    "september": 9, "sep": 9, "sept": 9, "setyembre": 9, "septiyembre": 9,
    "october": 10, "oct": 10, "oktubre": 10,
    "november": 11, "nov": 11, "nobyembre": 11,
    "december": 12, "dec": 12, "disyembre": 12,
}
# Spanish-derived clock numbers used after "alas-".
_CLOCK_WORDS = {
    "una": 1, "dos": 2, "tres": 3, "kuwatro": 4, "kwatro": 4, "kuatro": 4, "singko": 5, "sinko": 5,
    "sais": 6, "siyete": 7, "syete": 7, "otso": 8, "nuwebe": 9, "nwebe": 9, "diyes": 10, "dyis": 10,
    "onse": 11, "dose": 12,
}
_NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
                 "isa": 1, "dalawa": 2, "tatlo": 3, "apat": 4, "lima": 5}

# Phrases with no single resolvable day.
_AMBIGUOUS_RE = re.compile(
    r"\b(?:next\s+week|this\s+week|within\s+the\s+week|sometime|soon|asap|as\s+soon\s+as\s+possible|"
    r"in\s+the\s+coming\s+days|next\s+few\s+days|later\s+this\s+(?:week|month)|end\s+of\s+(?:the\s+)?month|"
    r"next\s+month|susunod\s+na\s+linggo|sa\s+isang\s+linggo|ngayong\s+linggo|"
    r"sa\s+lalong\s+madaling\s+panahon|sa\s+susunod\s+na\s+buwan|ngayong\s+buwan|katapusan\s+ng\s+buwan)\b"
)
_PART_OF_DAY = (
    # (pattern, hour, minute); the first match wins, so longer phrases come first.
    (r"\b(?:after\s+lunch|pagkatapos\s+ng\s+tanghalian|pagkatapos\s+mananghalian)\b", 13, 0),
    (r"\b(?:end\s+of\s+(?:the\s+)?day|eod|close\s+of\s+business|cob|katapusan\s+ng\s+araw|bago\s+mag-?uwian)\b", 17, 0),
    (r"\b(?:midnight|hatinggabi)\b", 23, 59),
    (r"\b(?:noon|tanghaling[-\s]tapat|tanghalian|tanghali|lunch)\b", 12, 0),
    (r"\b(?:morning|umaga)\b", 9, 0),
    (r"\b(?:afternoon|hapon)\b", 15, 0),
    (r"\b(?:evening)\b", 19, 0),
    (r"\b(?:night|tonight|gabi)\b", 21, 0),
)
_PM_CONTEXT_RE = re.compile(r"\b(?:hapon|gabi|afternoon|evening|night|tonight|pm|p\.m\.)\b")
_AM_CONTEXT_RE = re.compile(r"\b(?:umaga|morning|madaling[-\s]araw|am|a\.m\.)\b")
_CLOCK_RE = re.compile(
    r"(?<![\d:])(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<meridiem>a\.?m\.?|p\.?m\.?|nn|n\.n\.)(?![a-z])"
)
_ALAS_RE = re.compile(
    rf"\balas[-\s]+(?P<hour>\d{{1,2}}|{'|'.join(_CLOCK_WORDS)})(?::(?P<minute>\d{{2}}))?(?P<half>\s+y\s+medy?a)?\b"
)
_AT_HOUR_RE = re.compile(r"\b(?:at|by|@)\s+(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?(?![\d:apn])")
_ISO_RE = re.compile(r"\b(?P<year>20\d{2})-(?P<month>\d{2})-(?P<day>\d{2})\b")
_MONTH_NAMES = "|".join(sorted(_MONTH_WORDS, key=len, reverse=True))
_MONTH_DAY_RE = re.compile(rf"\b(?P<month>{_MONTH_NAMES})\.?\s+(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\b")
_DAY_MONTH_RE = re.compile(rf"\b(?P<day>\d{{1,2}})(?:st|nd|rd|th)?\s+(?:ng\s+)?(?P<month>{_MONTH_NAMES})\b")
_IN_DAYS_RE = re.compile(
    rf"\b(?:in|after|within|sa\s+loob\s+ng|pagkalipas\s+ng)\s+(?P<count>\d+|{'|'.join(_NUMBER_WORDS)})\s+(?:days?|araw)\b"
)
_WEEKDAY_NAMES = "|".join(sorted(_WEEKDAY_WORDS, key=len, reverse=True))
_NEXT_WEEKDAY_RE = re.compile(rf"\b(?:next|sa\s+susunod\s+na|susunod\s+na)\s+(?P<day>{_WEEKDAY_NAMES})\b")
_WEEKDAY_RE = re.compile(rf"\b(?:this\s+|ngayong\s+|sa\s+)?(?P<day>{_WEEKDAY_NAMES})\b")
_DAY_AFTER_TOMORROW_RE = re.compile(r"\b(?:day\s+after\s+tomorrow|sa\s+makalawa|makalawa)\b")
_TOMORROW_RE = re.compile(r"\b(?:tomorrow|tmrw|tom|bukas)\b")
_TODAY_RE = re.compile(r"\b(?:today|tonight|ngayon|ngayong\s+araw|ngayong|mamaya|mamayang|later|this)\b")


def phrase_to_code(phrase: str, received: dt.datetime) -> str:
    """Map a DATE phrase in English, Taglish or Filipino to a resolution code."""
    text = re.sub(r"[,;]", " ", phrase.casefold())
    text = re.sub(r"\s+", " ", text).strip()
    if not text or _AMBIGUOUS_RE.search(text):
        return "?"
    day = _day_code(text, received)
    clock = _clock(text)
    if day is None:
        if clock is None:
            return "?"
        day = "+0"
    return f"{day}@{clock[0]:02d}:{clock[1]:02d}" if clock else day


def resolve(code: str, received: dt.datetime) -> tuple[str | None, bool]:
    """Return (ISO date or datetime, ambiguous). Same rules as dslib.resolve."""
    code = code.strip()
    if code == "?":
        return None, True
    if code == "":
        return None, False
    clock = None
    if "@" in code:
        code, clock = code.split("@")
    day = _resolve_day(code, received)
    if clock:
        hour, minute = map(int, clock.split(":"))
        return dt.datetime(day.year, day.month, day.day, hour, minute, tzinfo=received.tzinfo).isoformat(), False
    return day.isoformat(), False


def resolve_phrase(phrase: str, received: dt.datetime) -> tuple[str | None, bool]:
    return resolve(phrase_to_code(phrase, received), received)


def resolved_datetime(value: str | None, tzinfo: dt.tzinfo, *, default_hour: int = 17) -> dt.datetime | None:
    """A resolved ISO value as an aware datetime; date-only values get the end-of-business hour."""
    if value is None:
        return None
    parsed = dt.datetime.fromisoformat(value)
    if len(value) <= 10:
        return parsed.replace(hour=default_hour, tzinfo=tzinfo)
    return parsed


def has_conflict(resolved_values: list[str | None], busy: list[tuple[dt.datetime, dt.datetime]] | None) -> bool:
    """True if a timed (not date-only, not ambiguous) DATE falls inside a busy period."""
    if not busy:
        return False
    for value in resolved_values:
        if value is None or len(value) <= 10:
            continue
        moment = dt.datetime.fromisoformat(value)
        if any(start <= moment < end for start, end in busy):
            return True
    return False


def _resolve_day(code: str, received: dt.datetime) -> dt.date:
    day = received.date()
    if code.startswith("+"):
        return day + dt.timedelta(days=int(code[1:]))
    if code.startswith("nxt:"):
        index = WEEKDAYS.index(code[4:])
        monday = day + dt.timedelta(days=7 - day.weekday())
        return monday + dt.timedelta(days=index)
    if code in WEEKDAYS:
        delta = (WEEKDAYS.index(code) - day.weekday()) % 7 or 7
        return day + dt.timedelta(days=delta)
    return dt.date.fromisoformat(code)


def _day_code(text: str, received: dt.datetime) -> str | None:
    if match := _ISO_RE.search(text):
        return f"{match['year']}-{match['month']}-{match['day']}"
    match = _MONTH_DAY_RE.search(text) or _DAY_MONTH_RE.search(text)
    if match and 1 <= int(match["day"]) <= 31:
        month, day_number = _MONTH_WORDS[match["month"]], int(match["day"])
        try:
            candidate = dt.date(received.year, month, day_number)
        except ValueError:
            return None
        if candidate < received.date():
            candidate = candidate.replace(year=received.year + 1)
        return candidate.isoformat()
    if match := _IN_DAYS_RE.search(text):
        count = match["count"]
        return f"+{int(count) if count.isdigit() else _NUMBER_WORDS[count]}"
    if match := _NEXT_WEEKDAY_RE.search(text):
        return f"nxt:{_WEEKDAY_WORDS[match['day']]}"
    if _DAY_AFTER_TOMORROW_RE.search(text):
        return "+2"
    if _TOMORROW_RE.search(text):
        return "+1"
    if match := _WEEKDAY_RE.search(text):
        word = match["day"]
        # "sun"/"sat"/"mar"-style short forms only count when they stand alone as a weekday.
        return _WEEKDAY_WORDS[word]
    if _TODAY_RE.search(text):
        return "+0"
    return None


def _clock(text: str) -> tuple[int, int] | None:
    if match := _CLOCK_RE.search(text):
        hour, minute = int(match["hour"]), int(match["minute"] or 0)
        meridiem = match["meridiem"].replace(".", "")
        if meridiem == "pm" and hour < 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        elif meridiem in {"nn"}:
            hour = 12
        return _valid(hour, minute)
    match = _ALAS_RE.search(text) or _AT_HOUR_RE.search(text)
    if match:
        raw = match["hour"]
        hour = int(raw) if raw.isdigit() else _CLOCK_WORDS[raw]
        minute = int(match["minute"] or 0)
        if match.groupdict().get("half"):
            minute = 30
        return _valid(_meridiem_from_context(hour, text), minute)
    for pattern, hour, minute in _PART_OF_DAY:
        if re.search(pattern, text):
            return hour, minute
    return None


def _meridiem_from_context(hour: int, text: str) -> int:
    """Hour without am/pm: use umaga/hapon/gabi if present, else office hours (1-6 is afternoon)."""
    if hour >= 13:
        return hour
    if _PM_CONTEXT_RE.search(text):
        return hour + 12 if hour < 12 else hour
    if _AM_CONTEXT_RE.search(text):
        return 0 if hour == 12 else hour
    return hour + 12 if 1 <= hour <= 6 else hour


def _valid(hour: int, minute: int) -> tuple[int, int] | None:
    return (hour, minute) if 0 <= hour <= 23 and 0 <= minute <= 59 else None
