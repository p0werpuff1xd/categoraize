"""/api/v1/match: zero-shot matching used for rules, cold email and sender categories."""

from conftest import AUTH

RULES = [
    {"id": "newsletter", "text": "Newsletters, digests and marketing emails from mailing lists"},
    {"id": "receipts", "text": "Receipts, invoices, order confirmations and payment notices"},
    {"id": "school", "text": "Emails from professors about classes, assignments and exams"},
]


def test_match_ranks_the_fitting_rule_first(client):
    response = client.post(
        "/api/v1/match",
        json={
            "subject": "Your receipt from Grab",
            "body": "Thanks for your payment of PHP 245.00. Order #1293 has been confirmed.",
            "candidates": RULES,
        },
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ranked"][0]["id"] == "receipts"
    assert body["best"]["id"] == "receipts"
    assert len(body["embedding"]) == 384
    assert body["has_task"] is False


def test_match_reports_requests_found_by_the_tagger(client):
    response = client.post(
        "/api/v1/match",
        json={"subject": "Report", "body": "Hi team, paki-send ang final report bukas.", "candidates": RULES},
        headers=AUTH,
    )
    assert response.json()["has_task"] is True


def test_match_returns_no_best_below_threshold(client):
    response = client.post(
        "/api/v1/match",
        json={"subject": "Your receipt", "body": "Payment received.", "candidates": RULES, "threshold": 0.99},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.json()["best"] is None


def test_match_rejects_candidates_without_text_or_centroid(client):
    response = client.post(
        "/api/v1/match", json={"body": "hi", "candidates": [{"id": "x", "text": "  "}]}, headers=AUTH
    )
    assert response.status_code == 422


def test_match_requires_the_internal_key(client):
    assert client.post("/api/v1/match", json={"body": "hi", "candidates": RULES}).status_code == 401
