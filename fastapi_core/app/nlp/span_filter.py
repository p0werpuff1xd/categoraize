"""Drop TASK/DATE spans that are noise rather than requests or deadlines.

The tagger marks any imperative-looking or date-looking text, so newsletters,
account notices, receipts and marketing copy filled the Task Sheet and showed
"Date needs review" on almost every email. Kept here: what a user can act on.

- DATE spans need a date anchor (a month or weekday name, a relative day such
  as tomorrow/bukas, a numeric date, "in 3 days", or a clock time). Bare
  numbers and ordinals ("1", "5th", "16th and 17th"), amounts ("P 7.28"),
  years ("2020"), "now" and "an afternoon" are not dates.
- DATE spans that resolve to nothing are dropped: nothing to review or count.
- TASK spans that are statements about what already happened ("You allowed
  Google Drive access", "We received your order") are dropped unless they
  also carry a request cue (please, kindly, paki-, need to, can you ...).
- An email with more than MAX_PLAIN_TASKS task spans is an essay or a notice,
  not a list of requests: only spans with a request cue are kept.
- Promotional mail keeps no TASK or DATE spans: "Shop now" and "ends today"
  are not the user's tasks or deadlines.

Dates before the email was received are dropped where they are resolved
(main._extract_spans), since that needs the receipt time.
"""

import re
from collections.abc import Sequence
from typing import Protocol, TypeVar

MAX_PLAIN_TASKS = 5

_STATEMENT_START = re.compile(
    r"^(?:you|we|i|they|it|this|that|these|your|our|he|she)\b(?:'(?:ve|re|ll|d|s))?\s",
    re.IGNORECASE,
)
_REQUEST_CUE = re.compile(
    r"\b(?:please|pls|kindly|paki|pakí|need(?:s)? to|have to|has to|must|should|"
    r"can you|could you|would you|will you|make sure|don't forget|remember to|"
    r"kailangan|dapat|wag kalimutan|huwag kalimutan)\b|\bpaki-?\w",
    re.IGNORECASE,
)

_MONTHS = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|"
    r"sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|"
    r"enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre"
)
_WEEKDAYS = (
    r"mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs?(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|"
    r"lunes|martes|miyerkules|huwebes|biyernes|sabado|linggo"
)
_RELATIVE = (
    r"today|tonight|tomorrow|tmrw|tom|yesterday|eod|eow|cob|weekend|"
    r"bukas|mamaya(?:ng)?|ngayon(?:g\s+araw)?|makalawa|samakalawa|kinabukasan|"
    r"(?:this|next|coming|end of(?: the)?)\s+(?:week|month|year|quarter|semester|term)|"
    r"end of (?:the )?day|in \d+ (?:days?|weeks?|months?|hours?)|within \d+ (?:days?|weeks?|hours?)|"
    r"\d+ (?:days?|weeks?) (?:from now|after|before)|susunod na (?:linggo|buwan)|"
    r"(?:this|tomorrow|today|in the)\s+(?:morning|afternoon|evening|night)|after lunch|later today|"
    r"umaga|tanghali|tanghalian|hapon|gabi|katapusan|sometime|soon"
)
_DATE_ANCHOR = re.compile(
    rf"\b(?:{_MONTHS}|{_WEEKDAYS}|{_RELATIVE})\b"
    r"|\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b"
    r"|\b\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\balas[\s-]+\d"
    r"|(?<![\d:])(?:[01]?\d|2[0-3]):[0-5]\d(?![\d:])",
    re.IGNORECASE,
)


class _Span(Protocol):
    label: str
    text: str
    resolved: object | None


S = TypeVar("S", bound=_Span)


# Fragments of notices, not requests: "added to your account", "device was
# added", "If you did not request", "Account ending in 8550".
_NOTICE_FRAGMENT = re.compile(
    r"^(?:(?:was|were|has been|have been|been|recently|successfully)\b|\w+ed (?:to|by|from|on|in)\b"
    r"|if you (?:did ?n[o']t|didn't|do not|don't)\b|account ending\b|new \w+(?: \w+)? (?:added|created|sign))"
    r"|\b(?:was|were|has been|have been) (?:recently )?(?:added|authorized|created|sent|received|changed|updated)\b",
    re.IGNORECASE,
)


def is_statement(text: str) -> bool:
    stripped = text.strip()
    if _REQUEST_CUE.search(stripped):
        return False
    return bool(_STATEMENT_START.match(stripped) or _NOTICE_FRAGMENT.search(stripped))


_NO_ACTION = re.compile(
    r"\b(?:do(?:n't|n’t| not)|does(?:n't|n’t| not)|no) (?:need|have) to\b|\bno (?:further )?action\b"
    r"|\bneed to take any action\b|\bnothing (?:else )?(?:to do|you need)",
    re.IGNORECASE,
)


def has_request_cue(text: str) -> bool:
    return bool(_REQUEST_CUE.search(text)) and not _NO_ACTION.search(text)


def is_date_phrase(text: str) -> bool:
    return bool(_DATE_ANCHOR.search(text))


def filter_spans(spans: Sequence[S], *, promotional: bool, automated: bool = False) -> list[S]:
    if promotional:
        return [span for span in spans if span.label not in {"TASK", "DATE"}]
    kept: list[S] = []
    for span in spans:
        # An unresolved date with a real date word stays (shown for review);
        # "TESTS", "day 2" or "1" without one is dropped.
        if span.label == "DATE" and not is_date_phrase(span.text):
            continue
        if span.label == "TASK" and (is_statement(span.text) or _NO_ACTION.search(span.text)):
            continue
        kept.append(span)
    tasks = [span for span in kept if span.label == "TASK"]
    # No-reply notices are mostly boilerplate ("Paste this link", logo and
    # trademark lines): only an explicit request is a task there.
    if automated or len(tasks) > MAX_PLAIN_TASKS:
        kept = [span for span in kept if span.label != "TASK" or has_request_cue(span.text)]
    return kept
