from math import sqrt
from typing import Sequence


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError("vectors must have the same dimension")

    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0

    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)


def rank_categories(
    email_vector: Sequence[float],
    categories: Sequence[tuple[str, Sequence[float]]],
    threshold: float,
) -> list[dict[str, float | str | bool]]:
    ranked = [
        {
            "category_id": category_id,
            "similarity": cosine_similarity(email_vector, vector),
        }
        for category_id, vector in categories
    ]
    ranked.sort(key=lambda item: float(item["similarity"]), reverse=True)
    for item in ranked:
        item["meets_threshold"] = float(item["similarity"]) >= threshold
    return ranked
