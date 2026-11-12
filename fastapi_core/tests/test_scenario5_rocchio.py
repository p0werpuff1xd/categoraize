"""Scenario 5: a corrected label moves the Rocchio centroids and changes later
classifications. Also covers the zero-vector and duplicate-feedback guards."""

import math

import pytest

from app.algorithms.feedback import FeedbackError, update_centroids
from conftest import AUTH, classify_payload


def _unit(index: int, dimension: int = 384) -> list[float]:
    vector = [0.0] * dimension
    vector[index] = 1.0
    return vector


def test_rocchio_formula():
    email = _unit(0)
    correct = _unit(1)
    incorrect = [1 / math.sqrt(2), 1 / math.sqrt(2)] + [0.0] * 382
    new_correct, new_incorrect = update_centroids(
        email=email, correct=correct, incorrect=incorrect, correct_id="a", incorrect_id="b"
    )
    norm = math.sqrt(1 + 0.2**2)
    assert new_correct[0] == pytest.approx(0.2 / norm)
    assert new_correct[1] == pytest.approx(1 / norm)
    assert math.fsum(value * value for value in new_correct) == pytest.approx(1.0)
    assert new_incorrect[0] < incorrect[0]
    assert math.fsum(value * value for value in new_incorrect) == pytest.approx(1.0)


def test_zero_vector_guards():
    with pytest.raises(FeedbackError):
        update_centroids(email=[0.0] * 384, correct=_unit(1), incorrect=None, correct_id="a", incorrect_id=None)
    with pytest.raises(FeedbackError):
        update_centroids(email=_unit(0), correct=[0.0] * 384, incorrect=None, correct_id="a", incorrect_id=None)
    # Subtracting the email from a centroid equal to beta*email would produce a zero vector: keep the old one.
    _, kept = update_centroids(
        email=_unit(0), correct=_unit(1), incorrect=[0.15] + [0.0] * 383, correct_id="a", incorrect_id="b"
    )
    assert kept == pytest.approx(_unit(0))


def test_duplicate_feedback_guard(client):
    with pytest.raises(FeedbackError):
        update_centroids(email=_unit(0), correct=_unit(1), incorrect=_unit(1), correct_id="a", incorrect_id="a")
    response = client.post(
        "/api/v1/feedback",
        json={"embedding": _unit(0), "correct": {"id": "a", "centroid": _unit(1)}, "incorrect": {"id": "a", "centroid": _unit(1)}},
        headers=AUTH,
    )
    assert response.status_code == 422
    zero = client.post(
        "/api/v1/feedback",
        json={"embedding": [0.0] * 384, "correct": {"id": "a", "centroid": _unit(1)}},
        headers=AUTH,
    )
    assert zero.status_code == 422


def test_correction_changes_later_classification(client, loaded_model):
    first_email = {
        "subject": "Tuition payment",
        "body": "Paki-settle naman ang tuition fee balance para sa second semester bago ang enrollment.",
    }
    later_email = {
        "subject": "Tuition reminder",
        "body": "Reminder: the remaining tuition fee for the semester must be paid at the cashier.",
    }
    categories = [
        {"id": "school", "name": "School", "description": "University classes, enrollment, professors and coursework."},
        {"id": "money", "name": "Bills and Payments", "description": "Bills, fees, invoices and payments."},
    ]
    vectors = loaded_model.embed([f"{c['name']}: {c['description']}" for c in categories])
    for category, vector in zip(categories, vectors):
        category["centroid"] = vector

    before = client.post("/api/v1/classify", json=classify_payload(**later_email, categories=categories), headers=AUTH).json()
    wrong = before["ranked"][0]["id"]
    right = before["ranked"][1]["id"]
    before_scores = {item["id"]: item["similarity"] for item in before["ranked"]}

    # The user corrects the first email (and, if needed, a second similar one) to the other category.
    email_vector = client.post("/api/v1/classify", json=classify_payload(**first_email, categories=categories), headers=AUTH).json()["embedding"]
    by_id = {category["id"]: category for category in categories}
    for _ in range(3):
        update = client.post(
            "/api/v1/feedback",
            json={
                "embedding": email_vector,
                "correct": {"id": right, "centroid": by_id[right]["centroid"]},
                "incorrect": {"id": wrong, "centroid": by_id[wrong]["centroid"]},
            },
            headers=AUTH,
        ).json()
        by_id[right]["centroid"] = update["correct"]["centroid"]
        by_id[wrong]["centroid"] = update["incorrect"]["centroid"]

    after = client.post("/api/v1/classify", json=classify_payload(**later_email, categories=categories), headers=AUTH).json()
    after_scores = {item["id"]: item["similarity"] for item in after["ranked"]}
    assert after_scores[right] > before_scores[right]
    assert after_scores[wrong] < before_scores[wrong]
    assert after["ranked"][0]["id"] == right


def test_pinned_category_survives_reclassification(client):
    payload = classify_payload(
        subject="Midterm exam schedule",
        body="The midterm exam for Data Structures will be on Thursday.",
        pinned_category_id="cat-finance",
    )
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    assert result["category"]["id"] == "cat-finance"
    assert result["ranked"][0]["id"] == "cat-academics"
    assert result["suggested_label"] is None

    unknown = classify_payload(subject="x", body="y", pinned_category_id="missing")
    assert client.post("/api/v1/classify", json=unknown, headers=AUTH).status_code == 422
