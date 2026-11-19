"""C8 Rocchio feedback: c+ = norm(c+ + 0.20 e), c- = norm(c- - 0.15 e)."""

import math

import pytest
from conftest import AUTH

from app.algorithms.feedback import FeedbackError, update_centroids

DIM = 384


def vec(*head):
    return list(head) + [0.0] * (DIM - len(head))


def test_hand_computed_update(case):
    # e = [1, 0], c+ = [0, 1], c- = [0.6, 0.8]
    # c+ + 0.20e = [0.2, 1.0],  |.| = sqrt(1.04) = 1.019804 -> [0.196116, 0.980581]
    # c- - 0.15e = [0.45, 0.8], |.| = sqrt(0.8425) = 0.917878 -> [0.490261, 0.871576]
    correct, incorrect = update_centroids(email=[1.0, 0.0], correct=[0.0, 1.0], incorrect=[0.6, 0.8],
                                          correct_id="a", incorrect_id="b")
    actual = [round(v, 6) for v in correct + incorrect]
    expected = [0.196116, 0.980581, 0.490261, 0.871576]
    case("e=[1,0], c+=[0,1], c-=[0.6,0.8], alpha 0.20, beta 0.15", expected, actual, tc="C8-01")
    assert actual == pytest.approx(expected, abs=1e-6)


def test_updated_centroids_are_unit_length(case):
    correct, incorrect = update_centroids(email=[0.3, 0.4, 0.5], correct=[1.0, 2.0, 2.0], incorrect=[2.0, 1.0, 0.5],
                                          correct_id="a", incorrect_id="b")
    norms = [round(math.sqrt(sum(v * v for v in x)), 9) for x in (correct, incorrect)]
    case("arbitrary 3-d vectors", [1.0, 1.0], norms, tc="C8-02")
    assert norms == [1.0, 1.0]


def test_correct_centroid_moves_toward_the_email(case):
    email, before = [1.0, 0.0], [0.0, 1.0]
    after, _ = update_centroids(email=email, correct=before, incorrect=None, correct_id="a", incorrect_id=None)
    dot = lambda x, y: sum(a * b for a, b in zip(x, y))  # noqa: E731
    case("cosine(email, c+) before vs after", "after > before", [dot(email, before), round(dot(email, after), 4)], tc="C8-03")
    assert dot(email, after) > dot(email, before)


@pytest.mark.parametrize(("tc", "kwargs", "label"), [
    pytest.param("C8-04", dict(email=[1.0, 0.0], correct=[0.0, 1.0], incorrect=[1.0, 0.0], correct_id="a", incorrect_id="a"),
                 "same correct and incorrect id", id="C8-04 same category"),
    pytest.param("C8-05", dict(email=[0.0, 0.0], correct=[0.0, 1.0], incorrect=None, correct_id="a", incorrect_id=None),
                 "zero email vector", id="C8-05 zero email"),
    pytest.param("C8-06", dict(email=[1.0, 0.0, 0.0], correct=[0.0, 1.0], incorrect=None, correct_id="a", incorrect_id=None),
                 "dimension mismatch", id="C8-06 dimension mismatch"),
])
def test_invalid_feedback_is_rejected(case, tc, kwargs, label):
    with pytest.raises(FeedbackError) as error:
        update_centroids(**kwargs)
    case(label, "FeedbackError", f"FeedbackError: {error.value}")


def test_incorrect_centroid_never_becomes_zero(case):
    _, incorrect = update_centroids(email=[1.0, 0.0], correct=[0.0, 1.0], incorrect=[0.15, 0.0],
                                    correct_id="a", incorrect_id="b")
    case("c- = 0.15e would subtract to zero", "old centroid kept, unit length", incorrect, tc="C8-07")
    assert incorrect == pytest.approx([1.0, 0.0])


def _feedback(client, centroid_a, centroid_b):
    return client.post("/api/v1/feedback", headers=AUTH, json={
        "embedding": vec(1.0, 0.0), "correct": {"id": "cat-1", "centroid": centroid_a},
        "incorrect": {"id": "cat-2", "centroid": centroid_b}}).json()


def test_feedback_is_isolated_between_users(client, case):
    user_a_first = _feedback(client, vec(0.0, 1.0), vec(0.6, 0.8))
    _feedback(client, vec(0.0, 0.0, 1.0), vec(0.0, 1.0))  # user B, different centroids
    user_a_again = _feedback(client, vec(0.0, 1.0), vec(0.6, 0.8))
    case("user A feedback, then user B feedback, then user A's identical request again",
         "user A's result unchanged (service keeps no state)", user_a_again == user_a_first, tc="C8-08")
    assert user_a_again == user_a_first


def test_endpoint_uses_the_documented_rates(client, case):
    result = _feedback(client, vec(0.0, 1.0), vec(0.6, 0.8))
    actual = [result["alpha"], result["beta"], round(result["correct"]["centroid"][0], 6)]
    case("default /api/v1/feedback request", [0.2, 0.15, 0.196116], actual, tc="C8-09")
    assert actual == [0.2, 0.15, 0.196116]


def test_endpoint_rejects_same_category(client, case):
    response = client.post("/api/v1/feedback", headers=AUTH, json={
        "embedding": vec(1.0), "correct": {"id": "x", "centroid": vec(0.0, 1.0)},
        "incorrect": {"id": "x", "centroid": vec(1.0)}})
    case("correct and incorrect are the same category", 422, response.status_code, tc="C8-10")
    assert response.status_code == 422
