"""Language ID for English, Filipino and Taglish.

Rules on lexicon hits decide first (langdetect is unreliable on short,
code-switched text); langdetect is the fallback for text the rules cannot
place. Anything that is neither English nor Tagalog is reported as unknown.
"""

import re
from typing import Literal

from langdetect import DetectorFactory, LangDetectException, detect_langs

from .taglish_cleaner import tagalog_vocabulary

Language = Literal["en", "tl", "mixed", "unknown"]

DetectorFactory.seed = 0

MIN_SHARE = 0.15
MIN_TOKENS = 2


def detect_language(text: str) -> Language:
    tokens = re.findall(r"[a-zñ]+(?:-[a-zñ]+)*", text.casefold())
    if len(tokens) < MIN_TOKENS:
        return "unknown"

    tagalog = tagalog_vocabulary()
    tl_hits = sum(1 for token in tokens if token in tagalog or token.startswith("paki"))
    en_hits = sum(1 for token in tokens if token in _ENGLISH_WORDS)
    tl_share = tl_hits / len(tokens)
    en_share = en_hits / len(tokens)

    if tl_share >= MIN_SHARE and en_share >= MIN_SHARE:
        return "mixed"
    if tl_share >= MIN_SHARE:
        return "tl"
    if en_share >= MIN_SHARE:
        return "en"
    return _langdetect_fallback(text)


def _langdetect_fallback(text: str) -> Language:
    try:
        candidates = detect_langs(text)
    except LangDetectException:
        return "unknown"
    best = candidates[0]
    if best.prob < 0.80:
        return "unknown"
    if best.lang == "en":
        return "en"
    if best.lang == "tl":
        return "tl"
    return "unknown"


_ENGLISH_WORDS = frozenset(
    """
    a about after all also am an and any are as at be been before but by can could
    did do does for from had has have he her here him his how i if in into is it its
    just me more my no not of on or our out please she should so some than thank thanks
    that the their them then there these they this to up us was we were what when where
    which who will with would you your yours
    kindly submit send review check update attach attached report reports file files
    meeting meetings schedule deadline due today tomorrow tonight week month year
    monday tuesday wednesday thursday friday saturday sunday morning afternoon evening
    call reply respond confirm sign pay payment invoice receipt order project document
    documents form forms class exam homework assignment teacher student office work team
    regards best hi hello dear sir maam ma'am let know need needs must asap urgent soon
    """.split()
)
