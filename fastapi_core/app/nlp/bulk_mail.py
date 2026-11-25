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


# Newsletter and mailing platforms: every message from them is a publication.
_NEWSLETTER_DOMAINS = re.compile(
    r"(?:^|\.)(?:substack\.com|beehiiv\.com|mailchimpapp\.com|mcsv\.net|convertkit-mail\d*\.com"
    r"|ghost\.io|buttondown\.email|medium\.com|e\.linkedin\.com|quora\.com)$",
    re.IGNORECASE,
)
# Bulk-sending subdomains: info.foodpanda.ph, mail.anthropic.com, news.x.com.
_MARKETING_SUBDOMAIN = re.compile(
    r"^(?:news|newsletter|info|marketing|promo|offers|deals|campaign|e|em|mkt)\d*\.", re.IGNORECASE
)
_AUTOMATED_SUBDOMAIN = re.compile(
    r"^(?:mail|email|mailer|notify|notifications?|alerts?|accounts?|security|mail-service|bounce|txn)\d*[.-]",
    re.IGNORECASE,
)


# Highest level for an automated notice (receipt, export done, account notice).
AUTOMATED_CAP = 3

# Automated mail that does need prompt attention keeps its level.
_URGENT_NOTICE = re.compile(
    r"security alert|suspicious|unusual (?:sign-?in|activity)|new (?:sign-?in|device)|verification code"
    r"|one-?time (?:code|password|pin)|\botp\b|password (?:reset|change)|account (?:locked|suspended|disabled)"
    r"|payment (?:failed|declined)|action required|final notice|will be (?:paused|deleted|suspended|closed)",
    re.IGNORECASE,
)


def is_urgent_notice(subject: str) -> bool:
    return bool(_URGENT_NOTICE.search(subject or ""))


@dataclass(frozen=True)
class BulkSignals:
    promotional: bool
    automated: bool
    newsletter: bool = False


def detect_bulk(subject: str, body: str, sender_email: str) -> BulkSignals:
    local, _, domain = (sender_email or "").strip().partition("@")
    text = f"{subject}\n{body}"
    footer = bool(_FOOTER.search(text))
    offers = len({match.group(0).lower() for match in _OFFER.finditer(text)})
    automated = bool(
        (local and _AUTOMATED_SENDER.search(local)) or (domain and _AUTOMATED_SUBDOMAIN.search(domain))
    )
    # A no-reply sender with even one offer phrase ("job alerts", "win a") is
    # a mailing, not a notice about the user's own account.
    newsletter = bool(domain and _NEWSLETTER_DOMAINS.search(domain)) or bool(
        local and re.match(r"^(?:newsletters?|digest)(?:[._+-]|$)", local, re.IGNORECASE)
    )
    # A notification footer ("manage your notifications", "you are receiving
    # this because you are subscribed") on a no-reply notice is not marketing:
    # GitHub CI failures and Google security alerts carry one. Urgent notices
    # are never promotional.
    promotional = not is_urgent_notice(subject) and (
        (footer and not automated)
        or offers >= 2
        or newsletter
        or (automated and offers >= 1)
        or bool(local and _MARKETING_SENDER.search(local))
        or bool(domain and _MARKETING_SUBDOMAIN.search(domain))
    )
    return BulkSignals(promotional=promotional, automated=automated, newsletter=newsletter)
