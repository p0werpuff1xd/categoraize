"""Scenario 1: an existing label is correctly selected by Sentence-BERT."""

import pytest

from conftest import AUTH, CATEGORIES, classify_payload

CASES = [
    (
        "Midterm exam schedule",
        "Good morning class, the midterm exam for Data Structures will be on Thursday. Review chapters 4 to 6.",
        "cat-academics",
    ),
    (
        "Your Lazada parcel is out for delivery",
        "Your order #8812 will arrive today. Rider: Juan.",
        "cat-deliveries",
    ),
    (
        "Naipadala na ang order mo",
        "Ang iyong package ay nasa delivery hub na at darating bukas. Tracking number: SPX123456.",
        "cat-deliveries",
    ),
    (
        "Thesis draft",
        "Hi, paki-submit naman ng revised thesis chapter 2 sa professor natin bago mag Friday.",
        "cat-academics",
    ),
]


@pytest.mark.parametrize(("subject", "body", "expected"), CASES)
def test_selects_existing_label(client, subject, body, expected):
    response = client.post("/api/v1/classify", json=classify_payload(subject=subject, body=body), headers=AUTH)
    assert response.status_code == 200
    result = response.json()
    assert result["category"] is not None, result["ranked"]
    assert result["category"]["id"] == expected
    assert result["ranked"][0]["id"] == expected
    similarities = [item["similarity"] for item in result["ranked"]]
    assert similarities == sorted(similarities, reverse=True)
    assert len(result["embedding"]) == 384
    assert result["suggested_label"] is None


def test_borderline_email_still_ranks_first(client, loaded_model):
    # Short transactional emails score near the 0.35 starting threshold with this model
    # (about 0.33 here), so they may come back Uncategorized; the ranking is still right,
    # and one Rocchio correction pulls the category over the threshold.
    payload = classify_payload(
        subject="Your electricity bill is ready",
        body="Your Meralco statement for October is now available. Amount due: PHP 2,315.40.",
    )
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    assert result["ranked"][0]["id"] == "cat-finance"

    finance = next(category for category in CATEGORIES if category["id"] == "cat-finance")
    finance_centroid = loaded_model.embed([f"{finance['name']}: {finance['description']}"])[0]
    corrected = client.post(
        "/api/v1/feedback",
        json={"embedding": result["embedding"], "correct": {"id": "cat-finance", "centroid": finance_centroid}},
        headers=AUTH,
    ).json()["correct"]["centroid"]
    categories = [
        {**category, "centroid": corrected} if category["id"] == "cat-finance" else category for category in CATEGORIES
    ]
    after = client.post("/api/v1/classify", json={**payload, "categories": categories}, headers=AUTH).json()
    assert after["category"] is not None and after["category"]["id"] == "cat-finance"


def test_stored_centroid_is_used_instead_of_description(client, loaded_model):
    finance_vector = loaded_model.embed(["Bills, invoices and payment receipts."])[0]
    categories = [
        {"id": "a", "name": "A", "description": "irrelevant text about gardening", "centroid": finance_vector},
        {"id": "b", "name": "B", "description": "Online orders and package deliveries"},
    ]
    payload = classify_payload(subject="Invoice #4411", body="Attached is your invoice; payment is due.", categories=categories)
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    assert result["category"]["id"] == "a"
