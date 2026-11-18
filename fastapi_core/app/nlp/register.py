"""Sender-tone register: formal | neutral | casual.

The learned classifier (logistic regression on the email embedding plus the
rule cues) is used when its model file exists; otherwise the rule detector
decides. The cue lists live in app/data/register_cues.json.
"""

import json
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from ..ml.linear import LinearModel

REGISTERS = ("formal", "neutral", "casual")
CUES_PATH = Path(__file__).resolve().parent.parent / "data" / "register_cues.json"
CUE_FEATURES = ("formal_hits", "casual_hits", "has_po", "emoji", "lowercase_starts", "exclamations")
_EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿\U0001F000-\U0001F2FF]|[:;]-?[)(DPp]|<3")
_SENTENCE_RE = re.compile(r"(?:^|[.!?\n]\s*)([A-Za-z])")


@dataclass(frozen=True)
class RegisterResult:
    register: str
    source: str  # learned | rules
    probabilities: dict[str, float] | None
    cues: dict[str, float]


@cache
def _cues() -> dict[str, list[str]]:
    data = json.loads(CUES_PATH.read_text(encoding="utf-8"))
    return {"formal": data["formal"], "casual": data["casual"]}


def _count(text: str, phrases: list[str]) -> int:
    total = 0
    for phrase in phrases:
        if phrase[0].isalnum() and phrase[-1].isalnum():
            total += len(re.findall(rf"(?<![\w-]){re.escape(phrase)}(?![\w-])", text))
        else:
            total += text.count(phrase)
    return total


def cue_features(subject: str, body: str) -> dict[str, float]:
    text = f"{subject}\n{body}"
    lowered = text.casefold()
    starts = _SENTENCE_RE.findall(body)
    return {
        "formal_hits": float(_count(lowered, _cues()["formal"])),
        "casual_hits": float(_count(lowered, _cues()["casual"])),
        "has_po": float(bool(re.search(r"(?<![\w-])(?:po|opo)(?![\w-])", lowered))),
        "emoji": float(len(_EMOJI_RE.findall(text))),
        "lowercase_starts": sum(letter.islower() for letter in starts) / len(starts) if starts else 0.0,
        "exclamations": float(text.count("!")),
    }


def rule_register(cues: dict[str, float]) -> str:
    formal = cues["formal_hits"] + cues["has_po"]
    casual = cues["casual_hits"] + cues["emoji"] + (1 if cues["lowercase_starts"] >= 0.5 else 0)
    if formal > casual:
        return "formal"
    if casual > formal:
        return "casual"
    return "neutral"


def learned_features(embedding: list[float], cues: dict[str, float]) -> list[float]:
    return [*embedding, *(cues[name] for name in CUE_FEATURES)]


def feature_names(dimension: int) -> list[str]:
    return [*(f"embedding_{index}" for index in range(dimension)), *CUE_FEATURES]


def detect_register(
    subject: str, body: str, *, embedding: list[float] | None, model: LinearModel | None
) -> RegisterResult:
    cues = cue_features(subject, body)
    if model is not None and embedding is not None:
        probabilities = model.predict_proba(learned_features(embedding, cues))
        by_class = {str(name): round(value, 4) for name, value in zip(model.classes, probabilities, strict=True)}
        return RegisterResult(max(by_class, key=by_class.__getitem__), "learned", by_class, cues)
    return RegisterResult(rule_register(cues), "rules", None, cues)
