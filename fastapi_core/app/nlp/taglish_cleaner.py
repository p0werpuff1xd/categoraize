"""Dictionary-based Taglish normalizer.

Maps Filipino/Taglish request affixes, particles, time words, weekdays and
months to English glosses so date resolution and language ID can work on a
single vocabulary. Used for analysis only; embeddings use the original text
because the multilingual Sentence-BERT model already handles Tagalog.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

LEXICON_PATH = Path(__file__).resolve().parent.parent / "data" / "taglish_lexicon.json"

# Tokens that are also common English words; they must not count as Tagalog evidence.
_AMBIGUOUS_WITH_ENGLISH = {"at", "o", "oh", "ah", "eh", "ho", "para", "din", "ano", "isa", "sino", "mayo"}


@lru_cache(maxsize=1)
def load_lexicon() -> dict:
    with LEXICON_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def tagalog_vocabulary() -> frozenset[str]:
    lexicon = load_lexicon()
    words: set[str] = set(lexicon["particles"])
    for section in ("time_words", "weekdays", "months", "deadline_markers", "words"):
        words.update(lexicon[section].keys())
    single_tokens = {word for word in words if " " not in word}
    return frozenset(single_tokens - _AMBIGUOUS_WITH_ENGLISH)


def normalize(text: str, *, drop_particles: bool = True) -> str:
    """Return a lowercase English-gloss version of Taglish text."""
    lexicon = load_lexicon()
    result = text.casefold()
    result = _REQUEST_PREFIX_RE.sub(lambda match: f"please {match.group('stem')}", result)

    for section in ("time_words", "deadline_markers", "weekdays", "months", "words"):
        result = _replace_phrases(result, lexicon[section])

    if drop_particles:
        particles = sorted(lexicon["particles"], key=len, reverse=True)
        pattern = r"\b(?:" + "|".join(re.escape(particle) for particle in particles) + r")\b"
        result = re.sub(pattern, " ", result)

    return re.sub(r"\s+", " ", result).strip()


def gloss_time_expression(text: str) -> str:
    """Normalize only date/time vocabulary, keeping everything else intact."""
    lexicon = load_lexicon()
    result = text.casefold()
    result = re.sub(r"\bsa\s+(?=\w)", "", result)
    result = re.sub(r"\bng\s+(?=(umaga|tanghali|hapon|gabi)\b)", "", result)
    for section in ("time_words", "weekdays", "months"):
        result = _replace_phrases(result, lexicon[section])
    return re.sub(r"\s+", " ", result).strip()


_REQUEST_PREFIX_RE = re.compile(r"\b(?:paki|pakí|maki)(?:-|\s)?(?P<stem>[a-z]+)", re.IGNORECASE)


def _replace_phrases(text: str, mapping: dict[str, str]) -> str:
    for source in sorted(mapping, key=len, reverse=True):
        target = mapping[source]
        text = re.sub(rf"(?<![\w-]){re.escape(source)}(?![\w-])", target, text)
    return text
