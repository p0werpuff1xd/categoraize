"""PII masking for Philippine formats (IAS Phase 11 J).

Must behave exactly like apps/web/utils/categoraize/pii.ts: both are tested
against the shared vectors in tests/data/pii_vectors.json.

Masked, in this order: mobile numbers -> [PHONE]; SSS, PhilHealth and TIN ->
[GOV_ID]; payment cards (card-shaped digit groups that pass the Luhn check) ->
[CARD]. Dates, amounts and order numbers are left alone. Only counts are kept,
never the masked values.
"""

import re
from dataclasses import dataclass, field

# 09xx / +639xx / 639xx, 10 digits after the 0, with optional single space,
# dot or dash separators (3-3-4 grouping).
_PHONE = re.compile(r"(?<![\d+])(?:\+63[ .-]?|63|0)9\d{2}[ .-]?\d{3}[ .-]?\d{4}(?!\d)")

# PhilHealth XX-XXXXXXXXX-X, SSS XX-XXXXXXX-X, TIN XXX-XXX-XXX(-XXX to -XXXXX).
_GOV_IDS = (
    re.compile(r"(?<![\d-])\d{2}-\d{9}-\d(?![\d-])"),
    re.compile(r"(?<![\d-])\d{2}-\d{7}-\d(?![\d-])"),
    re.compile(r"(?<![\d-])\d{3}-\d{3}-\d{3}(?:-\d{3,5})?(?![\d-])"),
)

# 4-4-4-(1..7) or Amex 4-6-5, with one consistent separator (or none).
_CARD_CANDIDATE = re.compile(
    r"(?<![\d-])(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -]?)\d{6}\2\d{5})(?![\d-])"
)
_NON_DIGIT = re.compile(r"\D")


@dataclass
class PiiCounts:
    phone: int = 0
    card: int = 0
    gov_id: int = 0

    @property
    def total(self) -> int:
        return self.phone + self.card + self.gov_id

    def as_dict(self) -> dict[str, int]:
        return {"phone": self.phone, "card": self.card, "gov_id": self.gov_id}


@dataclass
class PiiMaskResult:
    text: str
    counts: PiiCounts = field(default_factory=PiiCounts)


def luhn_valid(digits: str) -> bool:
    total = 0
    double = False
    for char in reversed(digits):
        digit = ord(char) - 48
        if double:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
        double = not double
    return total % 10 == 0


def mask_pii(text: str) -> PiiMaskResult:
    counts = PiiCounts()
    if not text:
        return PiiMaskResult(text, counts)

    def phone(_match: re.Match[str]) -> str:
        counts.phone += 1
        return "[PHONE]"

    def gov_id(_match: re.Match[str]) -> str:
        counts.gov_id += 1
        return "[GOV_ID]"

    def card(match: re.Match[str]) -> str:
        digits = _NON_DIGIT.sub("", match.group(0))
        if not 13 <= len(digits) <= 19 or not luhn_valid(digits):
            return match.group(0)
        counts.card += 1
        return "[CARD]"

    result = _PHONE.sub(phone, text)
    for pattern in _GOV_IDS:
        result = pattern.sub(gov_id, result)
    result = _CARD_CANDIDATE.sub(card, result)
    return PiiMaskResult(result, counts)
