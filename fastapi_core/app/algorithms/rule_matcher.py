"""Zero-shot rule matching with a confidence check (local first, LLM cascade).

Each rule becomes several short descriptions (its name, its text, and each
listed item; "Exclude..." sentences are dropped because similarity cannot
express "not"). A rule scores the similarity of its best description
(multi-prototype matching). The rule that means "someone needs my reply"
gets a boost when the tagger finds a request or the email asks a question.

The decision is "confident" when the winner clears the threshold by a band
and beats the runner-up by a margin; otherwise the web app may escalate the
email to the external LLM (only for users who opted in).
"""

import json
import re
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .classifier import cosine

PARAMS_PATH = Path(__file__).resolve().parent.parent / "data" / "matching_params.json"
# Learned centroids for the built-in rules (and "NONE": no rule fits), built by
# training.eval_matching from labeled synthetic emails (Rocchio-style mean of
# example embeddings). Custom rules never use them.
PROTOTYPES_PATH = Path(__file__).resolve().parent.parent / "data" / "rule_prototypes.json"
NONE_PROTOTYPE = "NONE"


@dataclass(frozen=True)
class RuleParams:
    threshold: float = 0.35
    request_boost: float = 0.15
    # The reply rule means "someone asked me for something", which the tagger
    # detects directly. It competes only when a request or question was found,
    # and then scores at least threshold + request_floor; a stronger match (a
    # calendar invite saying "accept or decline") can still beat it.
    request_floor: float = 0.02
    secondary_margin: float = 0.05
    # Confidence: winner at least `confident_band` above the threshold and
    # `confident_margin` ahead of the runner-up. "No match" is confident when
    # the best score is `confident_band` below the threshold.
    confident_band: float = 0.03
    confident_margin: float = 0.04


@dataclass(frozen=True)
class RuleInput:
    id: str
    name: str
    instructions: str
    reply_needed: bool = False
    system_type: str | None = None


# Extra short descriptions for the built-in system rules, in English and
# Filipino, because their default instructions are English-only and a
# Filipino email is less similar to English text. Custom rules use only the
# user's own wording.
SYSTEM_DESCRIPTIONS: dict[str, list[str]] = {
    "NEWSLETTER": [
        "newsletter issue with articles and stories", "weekly digest of news and posts",
        "liham-balita", "lingguhang balita at mga artikulo",
    ],
    "MARKETING": [
        "sale, discount and promo offer", "shop now with a voucher or discount code",
        "promo at diskwento", "bili na, may sale",
    ],
    "CALENDAR": [
        "meeting invitation with a date and time", "calendar event reminder or reschedule",
        "imbitasyon sa pulong", "paalala sa iskedyul o appointment",
    ],
    "RECEIPT": [
        "payment receipt with the amount paid", "order confirmation and invoice",
        "resibo ng bayad", "kumpirmasyon ng order at halaga",
    ],
    "NOTIFICATION": [
        "account security alert or new sign-in notice", "system status, maintenance or delivery update",
        "abiso tungkol sa account", "paalala o update mula sa sistema",
    ],
    "OTP": [
        "one-time verification code", "password reset or magic sign-in link",
        "ang iyong one-time PIN o code", "link para palitan ang password",
    ],
}


@dataclass
class RuleDecision:
    ranked: list[tuple[str, float]]
    matched: list[str]
    confident: bool
    reasons: list[str] = field(default_factory=list)


_PROTOTYPES: dict[str, list[float]] | None = None


def load_prototypes() -> dict[str, list[float]]:
    global _PROTOTYPES
    if _PROTOTYPES is None:
        _PROTOTYPES = (
            json.loads(PROTOTYPES_PATH.read_text(encoding="utf-8"))["prototypes"] if PROTOTYPES_PATH.exists() else {}
        )
    return _PROTOTYPES


def load_rule_params() -> RuleParams:
    if PARAMS_PATH.exists():
        data = json.loads(PARAMS_PATH.read_text(encoding="utf-8")).get("rules", {})
        return RuleParams(**{key: value for key, value in data.items() if key in RuleParams.__dataclass_fields__})
    return RuleParams()


def rule_descriptions(name: str, instructions: str) -> list[str]:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.!?])\s+", instructions or "")
        if sentence.strip() and not re.match(r"(?i)^(exclude|except|do not|don't|not)\b", sentence.strip())
    ]
    text = re.sub(r"^[^:]{1,40}:\s*", "", " ".join(sentences)).strip()
    text = re.sub(r"[.\s]+$", "", text)
    items = [re.sub(r"[.\s]+$", "", item.strip()) for item in re.split(r",|;|:|\bor\b|\band\b", text, flags=re.I)]
    descriptions: list[str] = []
    for description in [name.strip(), text, *[item for item in items if len(item) > 2]]:
        if description and description not in descriptions:
            descriptions.append(description)
    return descriptions


def choose_rule(
    email_vector: Sequence[float],
    rules: Sequence[RuleInput],
    *,
    has_request: bool,
    allow_multiple: bool,
    embed: Callable[[list[str]], list[list[float]]],
    params: RuleParams,
    prototypes: dict[str, list[float]] | None = None,
    language: str | None = None,
) -> RuleDecision:
    prototypes = load_prototypes() if prototypes is None else prototypes

    def prototype_vectors(kind: str) -> list[list[float]]:
        # The overall centroid plus, when known, the email language's own one.
        keys = [kind, f"{kind}@{language}"] if language else [kind]
        return [prototypes[key] for key in keys if key in prototypes]

    scores: list[tuple[str, float]] = []
    for rule in rules:
        descriptions = rule_descriptions(rule.name, rule.instructions) + SYSTEM_DESCRIPTIONS.get(
            rule.system_type or "", []
        )
        if not descriptions or (rule.reply_needed and not has_request):
            continue
        vectors = embed(descriptions)
        # A built-in rule also matches by its learned centroid, unless the user
        # rewrote its instructions (then only their wording counts).
        if rule.system_type is not None:
            vectors = [*vectors, *prototype_vectors(rule.system_type)]
        best = max(cosine(email_vector, vector) for vector in vectors)
        if rule.reply_needed:
            best = max(best + params.request_boost, params.threshold + params.request_floor)
        scores.append((rule.id, best))
    ranked = sorted(scores, key=lambda item: (-item[1], item[0]))
    if not ranked:
        return RuleDecision([], [], True, ["no rule has instructions"])

    top_id, top = ranked[0]
    runner_up = ranked[1][1] if len(ranked) > 1 else -1.0
    reasons: list[str] = []
    # "No rule fits" has its own centroid (personal chit-chat, greetings...).
    none_vectors = prototype_vectors(NONE_PROTOTYPE)
    if none_vectors:
        none_score = max(cosine(email_vector, vector) for vector in none_vectors)
        if none_score > top:
            confident = none_score - top >= params.confident_margin
            if not confident:
                reasons.append("closest to 'no rule fits', but only barely")
            return RuleDecision(ranked, [], confident, reasons)
        runner_up = max(runner_up, none_score)
    if top < params.threshold:
        confident = top <= params.threshold - params.confident_band
        if not confident:
            reasons.append("best rule is just below the threshold")
        return RuleDecision(ranked, [], confident, reasons)

    confident = True
    if top < params.threshold + params.confident_band:
        confident = False
        reasons.append("best rule only just clears the threshold")
    if top - runner_up < params.confident_margin:
        confident = False
        reasons.append("two rules score almost the same")

    matched = [top_id]
    if allow_multiple:
        matched += [
            rule_id
            for rule_id, score in ranked[1:2]
            if score >= params.threshold and score >= top - params.secondary_margin
        ]
    return RuleDecision(ranked, matched, confident, reasons)


def prototype_language(text: str) -> str | None:
    """Map language ID to the prototype keys: en, tl, taglish (None if unknown)."""
    from ..nlp.language import detect_language

    return {"en": "en", "tl": "tl", "mixed": "taglish"}.get(detect_language(text))


def params_dict(params: RuleParams) -> dict:
    return asdict(params)
