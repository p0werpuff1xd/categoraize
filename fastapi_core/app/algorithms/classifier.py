"""Sentence-BERT zero-shot classification: rank categories by cosine
similarity between the email embedding and each category centroid, and
accept the best one only when it clears the threshold."""

from collections.abc import Sequence
from dataclasses import dataclass
from math import sqrt


@dataclass(frozen=True)
class RankedCategory:
    id: str
    similarity: float


def rank_categories(
    email_vector: Sequence[float],
    centroids: Sequence[tuple[str, Sequence[float]]],
) -> list[RankedCategory]:
    ranked = [RankedCategory(category_id, cosine(email_vector, centroid)) for category_id, centroid in centroids]
    return sorted(ranked, key=lambda item: (-item.similarity, item.id))


def choose_category(ranked: Sequence[RankedCategory], threshold: float) -> RankedCategory | None:
    if not ranked or ranked[0].similarity < threshold:
        return None
    return ranked[0]


def cosine(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError("vectors must have the same dimension")
    dot = sum(a * b for a, b in zip(left, right))
    norm = sqrt(sum(a * a for a in left)) * sqrt(sum(b * b for b in right))
    if norm == 0:
        return 0.0
    return dot / norm
