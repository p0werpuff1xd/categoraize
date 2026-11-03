from datetime import datetime
from zoneinfo import ZoneInfo

from app.nlp.extraction import extract_deadlines, extract_instructions
from app.nlp.preprocessing import preprocess


def test_preprocessing_detects_taglish_and_preserves_meaningful_words():
    result = preprocess("Pa-check naman nung consumer lag; please review staging.")
    assert result.language == "taglish"
    assert "consumer lag" in result.text


def test_deadline_extraction_anchors_relative_dates_to_message_timezone():
    message_at = datetime(2026, 10, 27, 9, tzinfo=ZoneInfo("Asia/Manila"))
    result = extract_deadlines("Please submit bukas.", message_at=message_at, timezone="Asia/Manila")
    assert result[0].due_date is not None
    assert result[0].due_date.date().isoformat() == "2026-10-28"
    assert result[0].needs_review is False


def test_explicit_date_without_year_is_reviewable():
    message_at = datetime(2026, 10, 27, 9, tzinfo=ZoneInfo("Asia/Manila"))
    result = extract_deadlines("Deadline: October 30", message_at=message_at, timezone="Asia/Manila")
    assert result[0].needs_review is True


def test_instruction_extraction_supports_english_and_taglish():
    result = extract_instructions("Please review the report and paki-send the receipt.")
    assert len(result) == 2
    assert "review the report" in result[0].action.casefold()
    assert "send the receipt" in result[1].action.casefold()
