from html import unescape
import re

from .config import Settings

TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def sanitize_text(subject: str, body: str, settings: Settings) -> str:
    """Strip markup while preserving dates, times, and language cues."""
    subject_text = _strip_html(subject)
    body_text = _strip_html(body)
    combined = f"Subject: {subject_text}\n\n{body_text}".strip()
    return WHITESPACE_RE.sub(" ", combined)[: settings.max_text_chars]


def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+(?:[-/.]\w+)*|[^\w\s]", text, flags=re.UNICODE)


def _strip_html(value: str) -> str:
    return WHITESPACE_RE.sub(" ", unescape(TAG_RE.sub(" ", value))).strip()
