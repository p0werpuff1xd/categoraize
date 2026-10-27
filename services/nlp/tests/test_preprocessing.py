from app.config import Settings
from app.preprocessing import sanitize_text, tokenize


def test_sanitize_text_preserves_dates_and_taglish_words():
    settings = Settings(None, __import__("pathlib").Path("models"), "test", 1000, 2)
    result = sanitize_text("Deadline sa Friday", "<p>Submit by 2026-10-24, salamat!</p>", settings)
    assert "2026-10-24" in result
    assert "salamat" in result
    assert "<p>" not in result


def test_tokenize_keeps_date_like_token():
    assert "2026-10-24" in tokenize("Submit by 2026-10-24")
