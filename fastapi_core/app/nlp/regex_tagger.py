"""Bounded regex baseline for TASK and DATE spans.

Stand-in for the Bi-LSTM-CRF tagger (Phase 4) so the pipeline works end to
end, and later the comparison baseline and fallback. It deliberately covers
only a fixed list of English, Filipino and Taglish patterns.
"""

import re
from dataclasses import dataclass
from typing import Literal

SpanLabel = Literal["TASK", "DATE"]

MAX_TASK_CHARS = 120


@dataclass(frozen=True)
class RawSpan:
    label: SpanLabel
    text: str
    start: int
    end: int


def tag(text: str) -> list[RawSpan]:
    dates = _find_dates(text)
    tasks = _find_tasks(text, dates)
    return sorted([*dates, *tasks], key=lambda span: (span.start, span.label))


def has_deadline_marker_before(text: str, start: int) -> bool:
    window = text[max(0, start - 24) : start].casefold()
    return bool(_DEADLINE_MARKER_RE.search(window))


_WEEKDAYS_EN = r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:mon|tues|tue|wed|thurs|thur|thu|fri)\.?(?=\s|$|[,;:!?)])"
_WEEKDAYS_TL = "lunes|martes|miyerkules|miyerkoles|huwebes|biyernes|byernes|sabado|linggo"
_MONTHS = (
    "january|february|march|april|may|june|july|august|september|october|november|december|"
    "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|"
    "enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre"
)
_PART_OF_DAY = r"(?:\s+(?:ng\s+)?(?:morning|afternoon|evening|night|noon|umaga|tanghali|hapon|gabi))?"
_TIME = r"(?:\s*(?:at\s+|@\s*|ng\s+|alas[\s-]+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.|nn|n\.n\.)(?![a-z]))"

_DATE_PATTERNS = [
    # Filipino multi-word expressions first so they win over their parts.
    r"(?:sa\s+)?susunod\s+na\s+(?:linggo|buwan)",
    r"katapusan\s+ng\s+buwan",
    r"(?:sa\s+)?(?:sa)?makalawa",
    r"mamayang\s+(?:gabi|hapon|umaga|tanghali)",
    r"ngayong\s+(?:araw|linggo|buwan)",
    r"(?:bukas|mamaya|ngayon|kinabukasan)" + _PART_OF_DAY,
    rf"(?:sa\s+)?(?:{_WEEKDAYS_TL})",
    # English relative expressions.
    r"(?:the\s+)?day\s+after\s+tomorrow",
    r"(?:tomorrow|today|tonight)" + _PART_OF_DAY,
    r"end\s+of\s+(?:the\s+)?(?:day|week|month)",
    r"\b(?:eod|eow|cob)\b",
    r"(?:next|this)\s+(?:week|month)",
    rf"(?:next\s+|this\s+|coming\s+)?(?:{_WEEKDAYS_EN})" + _PART_OF_DAY,
    # Absolute dates.
    rf"(?:{_MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s*\d{{4}})?",
    rf"\d{{1,2}}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:{_MONTHS})(?:,?\s*\d{{4}})?",
    r"\d{4}-\d{2}-\d{2}",
    r"\d{1,2}/\d{1,2}(?:/\d{2,4})?",
]
_DATE_RE = re.compile(
    r"(?<![\w-])(?:" + "|".join(_DATE_PATTERNS) + r")(?:" + _TIME + r")?(?![\w-])",
    re.IGNORECASE,
)

_TASK_TRIGGERS = [
    r"paki(?:-|\s)?[a-z]+",
    r"pakisuyo(?:ng)?",
    r"(?:please|pls|plz|kindly)\s+(?!(?:find|see|note|be\s+advised|disregard|ignore)\b)[a-z]+",
    r"(?:can|could|would)\s+you(?:\s+please)?\s+[a-z]+",
    r"(?:make\s+sure|be\s+sure|remember|don't\s+forget|do\s+not\s+forget)\s+to\s+[a-z]+",
    r"you\s+(?:need|have)\s+to\s+[a-z]+",
    r"kailangan\s+(?:mo|niyo|ninyo|nating|natin)\s+(?:ng\s+)?[a-z]+",
    r"(?:ipasa|isumite|ipadala|sagutan|tapusin|bayaran|pirmahan)\b",
]
_TASK_RE = re.compile(r"(?<![\w-])(?:" + "|".join(_TASK_TRIGGERS) + r")", re.IGNORECASE)

# A task phrase ends at sentence punctuation, a line break, or a deadline connective.
_TASK_STOP_RE = re.compile(
    r"[.!?;\n]|,\s*(?:thanks|thank\s+you|salamat)\b|\s(?:by|before|until|no\s+later\s+than|on\s+or\s+before|hanggang|bago)\s",
    re.IGNORECASE,
)
_TRAILING_FILLER_RE = re.compile(
    r"(?:[\s,:\-]+|\s+(?:po|naman|lang|na|ha|please|asap|sa|on|ng|for|to|by|at|in|of|until|before)(?![\w-]))+$",
    re.IGNORECASE,
)
_DEADLINE_MARKER_RE = re.compile(
    r"\b(?:by|before|until|due(?:\s+(?:date|on|by))?|deadline|no\s+later\s+than|on\s+or\s+before|hanggang|bago|sa\s+or\s+bago|takdang\s+petsa)\b[\s:,]*(?:sa\s+|on\s+|the\s+)?$"
)


def _find_dates(text: str) -> list[RawSpan]:
    return [RawSpan("DATE", match.group(0), match.start(), match.end()) for match in _DATE_RE.finditer(text)]


def _find_tasks(text: str, dates: list[RawSpan]) -> list[RawSpan]:
    spans: list[RawSpan] = []
    cursor = 0
    for match in _TASK_RE.finditer(text):
        start = match.start()
        if start < cursor or any(date.start <= start < date.end for date in dates):
            continue
        limit = min(len(text), start + MAX_TASK_CHARS)
        stop = _TASK_STOP_RE.search(text, match.end(), limit)
        end = stop.start() if stop else limit
        for date in dates:
            if match.end() <= date.start < end:
                end = date.start
                break
        phrase = _TRAILING_FILLER_RE.sub("", text[start:end])
        end = start + len(phrase)
        if end <= start:
            continue
        spans.append(RawSpan("TASK", phrase, start, end))
        cursor = end
    return spans
