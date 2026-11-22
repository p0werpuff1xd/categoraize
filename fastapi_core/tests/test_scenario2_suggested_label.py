"""Scenario 2: an unmatched email gets a suggested label from the curated
library (never an invented name); creating it is left to the user."""

from app.algorithms.label_library import LABEL_TEMPLATES
from conftest import AUTH, classify_payload

# The default test categories are School, Bills and Payments, and Orders; a job interview fits none of them.
INTERVIEW = {
    "subject": "Interview invitation: Junior Software Engineer",
    "body": (
        "Thank you for applying to our company. We would like to invite you to a job interview "
        "with our hiring manager. Please confirm your availability for this week."
    ),
}


def test_unmatched_email_gets_library_suggestion(client):
    result = client.post("/api/v1/classify", json=classify_payload(**INTERVIEW), headers=AUTH).json()
    assert result["category"] is None, result["ranked"]
    suggestion = result["suggested_label"]
    assert suggestion is not None
    assert suggestion["name"] == "Jobs"
    assert suggestion["name"] in {template.name for template in LABEL_TEMPLATES}
    assert suggestion["similarity"] >= result["threshold"]


def test_no_suggestion_when_label_already_exists(client):
    categories = [{"id": "cat-jobs", "name": "Jobs", "description": "Job applications, interviews and recruiters."}]
    result = client.post("/api/v1/classify", json=classify_payload(**INTERVIEW, categories=categories), headers=AUTH).json()
    assert result["category"]["id"] == "cat-jobs"
    assert result["suggested_label"] is None


def test_no_suggestion_when_nothing_in_library_fits(client):
    payload = classify_payload(subject="hmm", body="ok", threshold=0.95)
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    assert result["category"] is None
    assert result["suggested_label"] is None
