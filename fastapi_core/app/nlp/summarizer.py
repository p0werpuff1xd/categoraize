"""Extractive summaries: up to N original sentences, never generated text.

Sentences are ranked by Sentence-BERT similarity to the email's centroid (the
mean of all its sentence vectors), the sentences most representative of the
whole email. Sentences the tagger marks as containing a request or a date get
a small boost, so "please send X by Friday" beats background detail. The
chosen sentences are returned in their original order.
"""

import math
import re
from collections.abc import Callable, Sequence

TASK_BOOST = 0.15
DATE_BOOST = 0.05
MIN_WORDS = 4

# Greetings, sign-offs and one-word lines carry no content worth summarizing.
_SKIP_RE = re.compile(
    r"^(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening)|magandang\s+\w+|kumusta|thanks|thank\s+you|"
    r"salamat|maraming\s+salamat|regards|best|cheers|sincerely|ingat|god\s+bless)\b[^.!?]{0,40}[,.!?]?$",
    re.IGNORECASE,
)
_SENTENCE_RE = re.compile(r"[^.!?\n]+(?:[.!?]+|$)")


def split_sentences(text: str) -> list[str]:
    sentences = []
    for line in text.splitlines():
        for match in _SENTENCE_RE.finditer(line):
            sentence = match.group(0).strip()
            if len(re.findall(r"\w+", sentence)) >= MIN_WORDS and not _SKIP_RE.match(sentence):
                sentences.append(sentence)
    return sentences


def summarize(
    sentences: Sequence[str],
    *,
    embed: Callable[[list[str]], list[list[float]]],
    span_labels: Callable[[str], set[str]],
    limit: int = 2,
) -> list[str]:
    if len(sentences) <= limit:
        return list(sentences)
    vectors = embed(list(sentences))
    centroid = _normalize([sum(column) / len(vectors) for column in zip(*vectors)])
    scores = []
    for index, (sentence, vector) in enumerate(zip(sentences, vectors, strict=True)):
        labels = span_labels(sentence)
        score = sum(a * b for a, b in zip(vector, centroid, strict=True))
        score += TASK_BOOST * ("TASK" in labels) + DATE_BOOST * ("DATE" in labels)
        scores.append((score, index))
    chosen = sorted(index for _score, index in sorted(scores, key=lambda item: (-item[0], item[1]))[:limit])
    return [sentences[index] for index in chosen]


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector
