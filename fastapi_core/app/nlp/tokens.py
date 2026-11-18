"""Tokenization with character offsets and BIO <-> span conversion.

Shared by the Bi-LSTM-CRF tagger at serving time and by the offline training
scripts, so both see exactly the same tokens.
"""

import re
from dataclasses import dataclass

LABELS = ("TASK", "DATE")
TAGS = ("O", "B-TASK", "I-TASK", "B-DATE", "I-DATE")
TAG_INDEX = {tag: index for index, tag in enumerate(TAGS)}

# Words keep inner hyphens and apostrophes ("paki-send", "don't", "alas-3");
# every other non-space character is its own token.
_TOKEN_RE = re.compile(r"\w+(?:[-'’]\w+)*|[^\w\s]")
# Sentence ends: the tagger runs one sentence (or line) at a time.
_SENTENCE_END = {".", "!", "?"}
# A dot after these is part of a title or abbreviation, not a sentence end.
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "engr", "atty", "sr", "jr", "st", "no", "vs", "etc", "gng", "bb", "g",
    "hon", "rev", "sgt", "capt", "dept", "approx", "nov", "dec", "jan", "feb", "mar", "apr", "jun", "jul",
    "aug", "sep", "sept", "oct", "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri",
}


@dataclass(frozen=True)
class Token:
    text: str
    start: int
    end: int


@dataclass(frozen=True)
class CharSpan:
    label: str
    start: int
    end: int


def tokenize(text: str) -> list[Token]:
    return [Token(match.group(0), match.start(), match.end()) for match in _TOKEN_RE.finditer(text)]


def split_sentences(text: str, tokens: list[Token], max_tokens: int = 120) -> list[list[Token]]:
    """Group tokens into sentences, also breaking at newlines and at max_tokens."""
    sentences: list[list[Token]] = []
    current: list[Token] = []
    for index, token in enumerate(tokens):
        current.append(token)
        next_token = tokens[index + 1] if index + 1 < len(tokens) else None
        newline_follows = next_token is not None and "\n" in text[token.end : next_token.start]
        # "1,980.00" and "a.m." are not sentence ends: the next token touches the dot.
        previous_word = tokens[index - 1].text.casefold() if index else ""
        after_abbreviation = token.text == "." and previous_word in _ABBREVIATIONS and index > 0 and (
            tokens[index - 1].end == token.start
        )
        dot_ends = (
            token.text in _SENTENCE_END
            and (next_token is None or next_token.start > token.end)
            and not (after_abbreviation and next_token is not None)
        )
        if dot_ends or newline_follows or len(current) >= max_tokens:
            sentences.append(current)
            current = []
    if current:
        sentences.append(current)
    return sentences


# Filipino affixes kept on the token ("mag-Friday", "pa-review") but left out of
# the span, matching the labeling guideline: "mag-" before a time means "by".
DETACHED_PREFIXES = {"DATE": ("mag-",), "TASK": ("pa-",)}


def spans_to_bio(tokens: list[Token], spans: list[CharSpan]) -> list[str]:
    tags = ["O"] * len(tokens)
    for span in spans:
        inside = [i for i, token in enumerate(tokens) if token.start < span.end and token.end > span.start]
        for position, index in enumerate(inside):
            tags[index] = f"{'B' if position == 0 else 'I'}-{span.label}"
    return tags


def bio_to_spans(tokens: list[Token], tags: list[str]) -> list[CharSpan]:
    """Decode BIO tags; a stray I- tag starts a new span instead of being dropped."""
    spans: list[CharSpan] = []
    label: str | None = None
    start = end = 0
    for token, tag in zip(tokens, tags, strict=True):
        prefix, _, tag_label = tag.partition("-")
        continues = prefix == "I" and tag_label == label
        if label is not None and not continues:
            spans.append(CharSpan(label, start, end))
            label = None
        if prefix == "B" or (prefix == "I" and not continues):
            label, start = tag_label, token.start + _detached_prefix_length(token.text, tag_label)
        if label is not None:
            end = token.end
    if label is not None:
        spans.append(CharSpan(label, start, end))
    return spans


def _detached_prefix_length(token_text: str, label: str) -> int:
    lowered = token_text.casefold()
    for prefix in DETACHED_PREFIXES.get(label, ()):
        if lowered.startswith(prefix) and len(lowered) > len(prefix):
            return len(prefix)
    return 0


_MARKUP_RE = re.compile(r"\[(TASK|DATE)\](.*?)\[/\1\]", re.DOTALL)
_STRAY_TAG_RE = re.compile(r"\[/?(?:TASK|DATE)\]")


class MarkupError(ValueError):
    pass


def parse_markup(marked: str) -> tuple[str, list[CharSpan]]:
    """'[TASK]paki-send ang report[/TASK] [DATE]bukas[/DATE]' -> plain text + spans."""
    text_parts: list[str] = []
    spans: list[CharSpan] = []
    cursor = 0
    length = 0
    for match in _MARKUP_RE.finditer(marked):
        before = marked[cursor : match.start()]
        inner = match.group(2)
        if _STRAY_TAG_RE.search(before) or _STRAY_TAG_RE.search(inner):
            raise MarkupError(f"unbalanced or nested tag near: {marked[max(0, match.start() - 20) : match.end()]!r}")
        text_parts.append(before)
        length += len(before)
        stripped = inner.strip()
        lead = len(inner) - len(inner.lstrip())
        text_parts.append(inner)
        if stripped:
            spans.append(CharSpan(match.group(1), length + lead, length + lead + len(stripped)))
        length += len(inner)
        cursor = match.end()
    rest = marked[cursor:]
    if _STRAY_TAG_RE.search(rest):
        raise MarkupError(f"unbalanced tag near: {rest[:40]!r}")
    text_parts.append(rest)
    return "".join(text_parts), spans
