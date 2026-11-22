"""Bulk-mail signals for emails no user category claimed.

Marketing and notification mail lands in Uncategorized when the user has no
label for it, and then took the default base priority plus any "deadline"
found in its copy ("ends today", a sale date), which ranked newsletters and
contest blasts as P5 Critical. Two signals, both from the email itself so
re-scoring a stored email gives the same answer:

- promotional: a marketing footer (unsubscribe, email preferences, view in
  browser, "you're receiving this"), a marketing sender address, or at least
  two offer phrases (one is enough from a no-reply sender). Treated like the
  Promotions category: capped at P2 and deadlines from the text ignored.
- automated: a no-reply or notification sender. Its dates are template text
  (export times, alert timestamps), so extracted deadlines are ignored; the
  level is not capped, since security and account notices can matter.

Only applied when no user category was chosen: a label the user made always
keeps its own base priority.
"""

import re
from dataclasses import dataclass

_FOOTER = re.compile(
    r"\bunsubscribe\b|\bmag-?unsubscribe\b|\bopt[- ]?out\b"
    r"|\bmanage (?:your )?(?:email |notification |subscription )?(?:preferences|settings|subscriptions)\b"
    r"|\b(?:update|change) (?:your )?(?:email )?preferences\b|\bemail preferences\b"
    r"|\bview (?:this email |it )?(?:in|on) (?:your |a )?(?:browser|web)\b"
    r"|\byou(?:'re| are) receiving this\b|\byou received this (?:email|message)\b"
    r"|\bno longer (?:wish|want) to receive\b|\bimportant privacy information\b"
    r"|\bplain text readers\b",
    re.IGNORECASE,
)

_OFFER = re.compile(
    r"\b\d{1,2} ?% off\b|\bsale\b|\bpromo(?: code)?\b|\bvoucher\b|\bcoupon\b|\bdiscount\b"
    r"|\bfree shipping\b|\blimited[- ]time\b|\bshop now\b|\bbuy now\b|\border now\b"
    r"|\b(?:chance|enter) to win\b|\bwin (?:a|an|your)\b|\bgiveaway\b|\bsweepstakes?\b"
    r"|\bexclusive (?:offer|deal|access)\b|\bdeals?\b|\bnewsletter\b|\bweekly (?:digest|stack|roundup)\b"
    r"|\bjob alerts?\b|\brecommended for you\b|\bpersonali[sz]ed recommendations\b",
    re.IGNORECASE,
)

_MARKETING_SENDER = re.compile(
    r"^(?:newsletters?|news|marketing|promo(?:tions?)?|offers?|deals|digest|hello|hi|team|info"
    r"|updates|campaigns?|mailer|mail|email|contests?|rewards|shop|store)(?:[._+-]|$)",
    re.IGNORECASE,
)
_AUTOMATED_SENDER = re.compile(
    r"^(?:no[._-]?reply|do[._-]?not[._-]?reply|notifications?|notify|alerts?|messages?"
    r"|account|accounts|security|support|system|mailer-daemon|jobs?-noreply|[a-z]+-noreply)(?:[._+-]|$)"
    r"|no[._-]?reply",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class BulkSignals:
    promotional: bool
    automated: bool


def detect_bulk(subject: str, body: str, sender_email: str) -> BulkSignals:
    local = (sender_email or "").split("@", 1)[0].strip()
    text = f"{subject}\n{body}"
    footer = bool(_FOOTER.search(text))
    offers = len({match.group(0).lower() for match in _OFFER.finditer(text)})
    automated = bool(local and _AUTOMATED_SENDER.search(local))
    # A no-reply sender with even one offer phrase ("job alerts", "win a") is
    # a mailing, not a notice about the user's own account.
    promotional = (
        footer
        or offers >= 2
        or (automated and offers >= 1)
        or bool(local and _MARKETING_SENDER.search(local))
    )
    return BulkSignals(promotional=promotional, automated=automated)
