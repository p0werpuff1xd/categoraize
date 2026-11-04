import pytest

from app.algorithms.cosine_similarity import cosine_similarity, rank_categories
from app.algorithms.priority_scoring import PriorityLevel, calculate_priority
from app.algorithms.rocchio import l2_normalize, update_centroids


def test_cosine_similarity_and_threshold_ranking():
    assert cosine_similarity([1, 0], [1, 0]) == pytest.approx(1.0)
    ranked = rank_categories([1, 0], [("a", [1, 0]), ("b", [0, 1])], 0.35)
    assert ranked[0]["category_id"] == "a"
    assert ranked[0]["meets_threshold"] is True
    assert ranked[1]["meets_threshold"] is False


def test_priority_normalizes_weights_and_maps_to_p5():
    result = calculate_priority(urgency=1, deadline=1, sender=1, calendar=1)
    assert result.level is PriorityLevel.P5
    assert sum(result.weights.values()) == pytest.approx(1.0)


def test_priority_dampener_reduces_promotional_score():
    result = calculate_priority(urgency=1, deadline=1, sender=1, calendar=1, dampener=0.2)
    assert result.level is PriorityLevel.P2


def test_rocchio_normalizes_updated_vectors_and_preserves_zero_guard():
    correct, incorrect = update_centroids(
        correct=[1, 0], incorrect=[0, 1], email=[0, 1]
    )
    assert l2_normalize(correct) == pytest.approx(correct)
    assert l2_normalize(incorrect) == pytest.approx(incorrect)
    assert l2_normalize([0, 0]) == [0.0, 0.0]


def test_algorithms_reject_mismatched_dimensions():
    with pytest.raises(ValueError):
        cosine_similarity([1], [1, 2])
    with pytest.raises(ValueError):
        update_centroids(correct=[1], incorrect=[1, 2], email=[1])
