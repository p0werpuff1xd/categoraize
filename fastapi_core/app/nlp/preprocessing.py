import re
from dataclasses import dataclass


@dataclass(frozen=True)
class PreprocessedText:
    text: str
    language: str


def preprocess(text: str) -> PreprocessedText:
    normalized = re.sub(r"\s+", " ", text.replace("\r", " ").replace("\n", " ")).strip()
    language = detect_language(normalized)
    return PreprocessedText(normalized, language)


def detect_language(text: str) -> str:
    lowered = text.casefold()
    tagalog_markers = (" naman", " paki", "pakicheck", "paki-send", " bukas", " sa ")
    has_tagalog = any(marker in lowered for marker in tagalog_markers)
    has_english = bool(re.search(r"\b(the|please|submit|review|tomorrow|deadline)\b", lowered))
    if has_tagalog and has_english:
        return "taglish"
    if has_tagalog:
        return "tl"
    if has_english:
        return "en"
    return "unknown"
