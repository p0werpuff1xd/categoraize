"""Local Reply Zero status from tagger signals (local first, LLM cascade).

Statuses, from the user's point of view:
- TO_REPLY: someone is waiting on the user (a request or question to them, or
  the user promised something and has not delivered it yet).
- AWAITING_REPLY: the user asked or requested something and is waiting.
- FYI: nothing is asked of the user (never used when the user wrote last).
- ACTIONED: the exchange is done (thanks, confirmation, the user took
  ownership, or the user sent what was asked).

The signals per message: a request (Bi-LSTM-CRF TASK span), a question
("?" or a Filipino question marker), a promise of a later reply or
deliverable, ownership ("I'll handle it"), and closing-only messages
("Thanks!", "Noted po"). Cases the rules cannot settle are marked not
confident, so the web app may ask the external LLM (only with consent).
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field

TO_REPLY, AWAITING_REPLY, FYI, ACTIONED = "TO_REPLY", "AWAITING_REPLY", "FYI", "ACTIONED"

_QUESTION_RE = re.compile(
    r"\?|\b(?:pwede\s+(?:po\s+)?(?:ba|bang)|puwede\s+(?:po\s+)?(?:ba|bang)|kailan|saan|paano|ano\s+po|sino|"
    r"magkano|meron\s+(?:po\s+)?ba|may\s+(?:\w+\s+)?ba)\b",
    re.IGNORECASE,
)
_PROMISE_RE = re.compile(
    r"\b(?:i(?:'|’)?ll|i\s+will|we(?:'|’)?ll|we\s+will)\b[^.!?\n]{0,40}?\b(?:send|get\s+back|follow\s+up|update\s+you|"
    r"reply|share|forward|let\s+you\s+know|confirm|email\s+you)\b|"
    r"\b(?:babalikan\s+(?:kita|ko\s+kayo|ko)|ipapadala\s+ko|isesend\s+ko|i-?send\s+ko|ise-?send\s+ko|"
    r"sasabihan\s+(?:kita|ko\s+kayo)|ia-?update\s+(?:kita|ko\s+kayo)|magre-?reply\s+ako)\b",
    re.IGNORECASE,
)
_OWNERSHIP_RE = re.compile(
    r"\b(?:i(?:'|’)?ll|i\s+will|we(?:'|’)?ll)\s+(?:handle|take\s+care\s+of|fix|sort\s+out|deal\s+with)\b|"
    r"\b(?:ako\s+na\s+(?:bahala|ang\s+bahala)|aayusin\s+ko)\b|"
    r"\b(?:done|sent|attached|submitted|na-?send\s+ko\s+na|naipasa\s+ko\s+na|nai-?send\s+ko\s+na|tapos\s+na)\b",
    re.IGNORECASE,
)
_CLOSING_RE = re.compile(
    r"^(?:thanks?|thank\s+you(?:\s+so\s+much)?|ty|noted|ok(?:ay)?|got\s+it|received|sige|salamat|"
    r"maraming\s+salamat|noted\s+po|ok\s+po|sige\s+po|salamat\s+po|thanks\s+po|perfect|great|"
    r"awesome|appreciated|copy|nice)(?:[\s,.!]+(?:po|so\s+much|a\s+lot|again|ha|everyone|team|\w+))*[\s.!]*$",
    re.IGNORECASE,
)


@dataclass
class ThreadMessage:
    from_user: bool
    subject: str
    body: str
    automated: bool = False


@dataclass
class Signals:
    request: bool
    question: bool
    promise: bool
    ownership: bool
    closing: bool


@dataclass
class StatusDecision:
    status: str
    confident: bool
    reason: str
    signals: dict = field(default_factory=dict)


def message_signals(message: ThreadMessage, tag: Callable[[str], list]) -> Signals:
    text = f"{message.subject}\n{message.body}".strip() if not message.from_user else message.body.strip()
    body = message.body.strip()
    return Signals(
        request=any(span.label == "TASK" for span in tag(body)),
        question=bool(_QUESTION_RE.search(body)),
        promise=bool(_PROMISE_RE.search(text)),
        ownership=bool(_OWNERSHIP_RE.search(body)),
        closing=bool(_CLOSING_RE.match(_first_line(body))) and len(re.findall(r"\w+", body)) <= 10,
    )


def asks_question(text: str) -> bool:
    return bool(_QUESTION_RE.search(text))


def determine_status(messages: list[ThreadMessage], tag: Callable[[str], list]) -> StatusDecision:
    if not messages:
        return StatusDecision(FYI, False, "empty thread")
    last = messages[-1]
    signals = message_signals(last, tag)
    summary = signals.__dict__

    if last.from_user:
        if signals.promise:
            return StatusDecision(TO_REPLY, True, "you promised to send or reply later", summary)
        if signals.question:
            return StatusDecision(AWAITING_REPLY, True, "you asked something and are waiting", summary)
        # "I'll handle it" closes the request even though it reads like a task.
        if signals.ownership or signals.closing:
            return StatusDecision(ACTIONED, True, "you confirmed, thanked or took care of it", summary)
        if signals.request:
            return StatusDecision(AWAITING_REPLY, True, "you requested something and are waiting", summary)
        return StatusDecision(ACTIONED, False, "you replied without asking anything; unclear if done", summary)

    if last.automated:
        return StatusDecision(FYI, True, "automated message", summary)
    # "I'll check and get back to you" puts the ball in their court, unless they
    # also asked the user something.
    if signals.promise and not signals.question:
        return StatusDecision(AWAITING_REPLY, True, "they promised to get back to you", summary)
    if signals.request or signals.question:
        return StatusDecision(TO_REPLY, True, "they asked you something", summary)
    if signals.closing:
        return StatusDecision(ACTIONED, True, "they thanked or confirmed", summary)

    # Informational last message: an earlier request to the user that the user
    # never answered still counts.
    pending = _pending_request_before(messages, tag)
    if pending:
        return StatusDecision(TO_REPLY, False, "an earlier request to you looks unanswered", summary)
    return StatusDecision(FYI, len(messages) == 1, "nothing is asked of you", summary)


def _pending_request_before(messages: list[ThreadMessage], tag: Callable[[str], list]) -> bool:
    for message in reversed(messages[:-1]):
        if message.from_user:
            return False
        earlier = message_signals(message, tag)
        if earlier.request or earlier.question:
            return True
    return False


def _first_line(text: str) -> str:
    return next((line.strip() for line in text.splitlines() if line.strip()), "")
