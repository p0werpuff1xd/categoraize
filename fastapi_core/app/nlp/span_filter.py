"""Drop TASK/DATE spans that are noise rather than requests or deadlines.

The tagger marks any imperative-looking or date-looking text, so newsletters,
account notices and marketing copy filled the Task Sheet and showed "Date
needs review" on almost every email. Kept here: what a user can act on.

- DATE spans that resolve to nothing ("this", "day 2") are dropped: there is
  no date to review or count.
- TASK spans that are statements about what already happened ("You allowed
  Google Drive access", "We received your order") are dropped unless they
  also carry a request cue (please, kindly, paki-, need to, can you ...).
- Promotional mail keeps no TASK or DATE spans: "Shop now" and "ends today"
  are not the user's tasks or deadlines.
"""

import re
from collections.abc import Sequence
from typing import Protocol, TypeVar

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


class _Span(Protocol):
    label: str
    text: str
    resolved: object | None


S = TypeVar("S", bound=_Span)


def is_statement(text: str) -> bool:
    stripped = text.strip()
    return bool(_STATEMENT_START.match(stripped)) and not _REQUEST_CUE.search(stripped)


def filter_spans(spans: Sequence[S], *, promotional: bool) -> list[S]:
    kept: list[S] = []
    for span in spans:
        if promotional and span.label in {"TASK", "DATE"}:
            continue
        if span.label == "DATE" and span.resolved is None:
            continue
        if span.label == "TASK" and is_statement(span.text):
            continue
        kept.append(span)
    return kept
