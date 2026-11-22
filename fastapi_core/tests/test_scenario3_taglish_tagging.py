"""Scenario 3: a Taglish request with "bukas" yields TASK + DATE and a reviewable deadline."""

import pytest
from conftest import AUTH, classify_payload

from app.services.tagger import DEFAULT_MODELS_DIR

TAGLISH = "Hi team, paki-send ang final weekly report bukas. Salamat!"

needs_trained_model = pytest.mark.skipif(
    not (DEFAULT_MODELS_DIR / "current.json").exists(),
    reason="no trained tagger; run python -m training.retrain",
)


def _spans(client):
    response = client.post("/api/v1/classify", json=classify_payload(body=TAGLISH), headers=AUTH)
    assert response.status_code == 200
    return response.json()["spans"]


@needs_trained_model
def test_bilstm_crf_tags_taglish_task_and_bukas_deadline(client, fresh_tagger):
    spans = _spans(client)
    assert {span["tagger"] for span in spans} == {"bilstm_crf"}
    task = next(span for span in spans if span["label"] == "TASK")
    date = next(span for span in spans if span["label"] == "DATE")
    assert "paki-send" in task["text"] and "report" in task["text"]
    assert date["text"] == "bukas"
    # Received Monday 2026-11-09 09:00 Manila; "bukas" = Tuesday, default due time 17:00.
    assert date["resolved"].startswith("2026-11-10T17:00:00")
    assert date["is_deadline"] is True
    assert date["ambiguous"] is False


def test_regex_fallback_when_forced(client, regex_tagger):
    spans = _spans(client)
    assert {span["tagger"] for span in spans} == {"regex"}
    assert {span["label"] for span in spans} == {"TASK", "DATE"}


def test_regex_fallback_when_no_model(client, fresh_tagger, tmp_path):
    fresh_tagger.setenv("CATEGORAIZE_TAGGER_DIR", str(tmp_path))
    spans = _spans(client)
    assert {span["tagger"] for span in spans} == {"regex"}
    assert "regex baseline" in client.get("/healthz").json()["tagger"]["error"]
