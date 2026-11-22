"""IAS Phase 11 J: the Python masker passes the vectors shared with the web app."""

import json
from pathlib import Path

import pytest

from app.nlp.pii import luhn_valid, mask_pii
from conftest import AUTH, classify_payload

VECTORS = json.loads((Path(__file__).parent / "data" / "pii_vectors.json").read_text(encoding="utf-8"))["cases"]


def test_has_vectors():
    assert len(VECTORS) > 20


@pytest.mark.parametrize("vector", VECTORS, ids=[vector["name"] for vector in VECTORS])
def test_shared_vector(vector):
    result = mask_pii(vector["input"])
    assert result.text == vector["expected"]
    assert result.counts.as_dict() == vector["counts"]


def test_classify_masks_before_tagging_and_keeps_the_deadline(client):
    body = "Paki-tawagan si Ana sa 0917-123-4567 bago bukas. SSS 34-1234567-8."
    result = client.post("/api/v1/classify", json=classify_payload(body=body), headers=AUTH).json()
    assert result["pii_masked"] == {"phone": 1, "card": 0, "gov_id": 1}
    texts = " ".join(span["text"] for span in result["spans"])
    assert "0917" not in texts and "1234567" not in texts
    date = next(span for span in result["spans"] if span["label"] == "DATE")
    assert date["text"] == "bukas" and date["is_deadline"]
    assert any(span["label"] == "TASK" for span in result["spans"])


def test_classify_respects_mask_pii_false(client):
    body = "Call 0917-123-4567 tomorrow."
    result = client.post(
        "/api/v1/classify", json=classify_payload(body=body, mask_pii=False), headers=AUTH
    ).json()
    assert result["pii_masked"] == {"phone": 0, "card": 0, "gov_id": 0}


def test_luhn():
    assert luhn_valid("4111111111111111")
    assert not luhn_valid("4111111111111112")
