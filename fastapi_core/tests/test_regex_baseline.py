"""Regex baseline spans (stand-in for the Bi-LSTM-CRF until Phase 4), date
resolution, the Taglish normalizer and language ID."""

from datetime import datetime

import pytest

from app.nlp.extractor import resolve_date
from app.nlp.language import detect_language
from app.nlp.regex_tagger import tag
from app.nlp.taglish_cleaner import normalize
from conftest import AUTH, RECEIVED_AT, TIMEZONE, classify_payload

RECEIVED = datetime.fromisoformat(RECEIVED_AT)  # Monday 2026-11-09 09:00 +08:00


def _spans(text, label):
    return [span.text for span in tag(text) if span.label == label]


@pytest.mark.parametrize(
    ("text", "task", "date"),
    [
        ("Please submit the lab report by Friday.", "Please submit the lab report", "Friday"),
        ("Kindly review the attached contract before Nov 20.", "Kindly review the attached contract", "Nov 20"),
        ("Paki-send ang report bukas po.", "Paki-send ang report", "bukas"),
        ("Pakicheck naman yung slides sa Biyernes.", "Pakicheck naman yung slides", "sa Biyernes"),
        ("Can you update the budget sheet tomorrow morning?", "Can you update the budget sheet", "tomorrow morning"),
        ("Ipasa ninyo ang assignment hanggang mamayang gabi.", "Ipasa ninyo ang assignment", "mamayang gabi"),
    ],
)
def test_baseline_tags_task_and_date(text, task, date):
    assert _spans(text, "TASK") == [task]
    assert _spans(text, "DATE") == [date]
    for span in tag(text):
        assert text[span.start : span.end] == span.text


def test_baseline_skips_non_requests():
    assert _spans("Please find attached the minutes.", "TASK") == []
    assert _spans("Please note that the office is closed.", "TASK") == []
    assert _spans("I sat down and had lunch.", "DATE") == []


@pytest.mark.parametrize(
    ("phrase", "expected", "ambiguous"),
    [
        ("bukas", "2026-11-10T17:00:00+08:00", False),
        ("tomorrow morning", "2026-11-10T09:00:00+08:00", False),
        ("sa Biyernes", "2026-11-13T17:00:00+08:00", False),
        ("Friday 3pm", "2026-11-13T15:00:00+08:00", False),
        ("mamayang gabi", "2026-11-09T20:00:00+08:00", False),
        ("Nov 20", "2026-11-20T17:00:00+08:00", False),
        ("next Friday", "2026-11-13T17:00:00+08:00", True),
        ("mamaya", "2026-11-09T17:00:00+08:00", True),
        ("3/4", "2027-03-04T17:00:00+08:00", True),
    ],
)
def test_resolve_date(phrase, expected, ambiguous):
    resolved = resolve_date(phrase, received_at=RECEIVED, timezone=TIMEZONE)
    assert resolved.value is not None
    assert resolved.value.isoformat() == expected
    assert resolved.ambiguous is ambiguous


def test_scenario3_taglish_bukas_through_api(client):
    payload = classify_payload(subject="Report", body="Hi team, paki-send ang final report bukas. Salamat!")
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    tasks = [span for span in result["spans"] if span["label"] == "TASK"]
    dates = [span for span in result["spans"] if span["label"] == "DATE"]
    assert [span["text"] for span in tasks] == ["paki-send ang final report"]
    assert dates[0]["text"] == "bukas"
    assert dates[0]["resolved"] == "2026-11-10T17:00:00+08:00"
    assert dates[0]["is_deadline"] is True and dates[0]["ambiguous"] is False
    assert all(span["tagger"] == "regex" for span in result["spans"])
    assert result["language"] == "mixed"


def test_normalizer_glosses_taglish():
    assert normalize("Paki-send po ang report bukas sa Biyernes") == "please send the report tomorrow on friday"


@pytest.mark.parametrize(
    ("text", "language"),
    [
        ("Please submit the report by Friday. Thanks!", "en"),
        ("Ipasa mo ang ulat bukas ng umaga po. Salamat.", "tl"),
        ("Hi team, paki-send ang final report bukas. Thanks!", "mixed"),
        ("ok", "unknown"),
        ("Bonjour, merci beaucoup pour votre réponse rapide et votre gentillesse.", "unknown"),
    ],
)
def test_language_id(text, language):
    assert detect_language(text) == language


def test_task_does_not_end_on_a_dangling_preposition():
    assert _spans("Please confirm your availability for this week.", "TASK") == ["Please confirm your availability"]


def test_due_date_label_marks_a_deadline(client):
    payload = classify_payload(body="Amount due: PHP 2,315.40. Due date: November 25.")
    result = client.post("/api/v1/classify", json=payload, headers=AUTH).json()
    dates = [span for span in result["spans"] if span["label"] == "DATE"]
    assert dates and dates[0]["is_deadline"] is True
