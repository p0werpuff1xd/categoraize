from math import sqrt
from typing import Sequence


def l2_normalize(vector: Sequence[float]) -> list[float]:
    norm = sqrt(sum(value * value for value in vector))
    if norm == 0:
        return [0.0 for _ in vector]
    return [value / norm for value in vector]


def update_centroids(
    *,
    correct: Sequence[float],
    incorrect: Sequence[float] | None,
    email: Sequence[float],
    alpha: float = 0.20,
    beta: float = 0.15,
) -> tuple[list[float], list[float] | None]:
    if len(correct) != len(email) or (incorrect is not None and len(incorrect) != len(email)):
        raise ValueError("all vectors must have the same dimension")

    updated_correct = l2_normalize([base + alpha * value for base, value in zip(correct, email)])
    updated_incorrect = None
    if incorrect is not None:
        updated_incorrect = l2_normalize(
            [base - beta * value for base, value in zip(incorrect, email)]
        )
    return updated_correct, updated_incorrect
