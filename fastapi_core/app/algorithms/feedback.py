"""Rocchio relevance feedback on category centroids.

On a correction: c_correct = normalize(c_correct + alpha*e) and
c_incorrect = normalize(c_incorrect - beta*e). The transformer is never
retrained; only the stored adaptive centroids move.
"""

from collections.abc import Sequence
from math import sqrt

ZERO_NORM_EPSILON = 1e-9


class FeedbackError(ValueError):
    """The correction cannot be applied (bad vectors or a no-op correction)."""


def update_centroids(
    *,
    email: Sequence[float],
    correct: Sequence[float],
    incorrect: Sequence[float] | None,
    correct_id: str,
    incorrect_id: str | None,
    alpha: float = 0.20,
    beta: float = 0.15,
) -> tuple[list[float], list[float] | None]:
    if incorrect_id is not None and incorrect_id == correct_id:
        raise FeedbackError("correct and incorrect category are the same; nothing to learn")
    if len(correct) != len(email) or (incorrect is not None and len(incorrect) != len(email)):
        raise FeedbackError("all vectors must have the same dimension")
    if _norm(email) < ZERO_NORM_EPSILON:
        raise FeedbackError("email embedding is a zero vector")
    if _norm(correct) < ZERO_NORM_EPSILON:
        raise FeedbackError("correct centroid is a zero vector")

    updated_correct = l2_normalize([base + alpha * value for base, value in zip(correct, email)])

    updated_incorrect = None
    if incorrect is not None:
        moved = [base - beta * value for base, value in zip(incorrect, email)]
        # If subtracting would erase the centroid entirely, keep the old one rather than storing a zero vector.
        updated_incorrect = l2_normalize(moved) if _norm(moved) >= ZERO_NORM_EPSILON else l2_normalize(incorrect)

    return updated_correct, updated_incorrect


def l2_normalize(vector: Sequence[float]) -> list[float]:
    norm = _norm(vector)
    if norm < ZERO_NORM_EPSILON:
        raise FeedbackError("cannot normalize a zero vector")
    return [value / norm for value in vector]


def _norm(vector: Sequence[float]) -> float:
    return sqrt(sum(value * value for value in vector))
