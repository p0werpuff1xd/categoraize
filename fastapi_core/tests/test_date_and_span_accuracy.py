"""Due dates and task spans from inbox review (synthetic emails only)."""

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.nlp.extractor import resolve_date
from app.nlp.span_filter import filter_spans, is_statement

MANILA = "Asia/Manila"
RECEIVED = datetime(2026, 11, 18, 9, 12, tzinfo=ZoneInfo(MANILA))  # a Wednesday


@pytest.mark.parametrize(
    ("phrase", "expected", "ambiguous"),
    [
        ("bukas ng 5pm", "2026-11-19 17:00", False),
        ("bukas ng alas-9 ng umaga", "2026-11-19 09:00", False),
        ("Biyernes nang alas-3 ng hapon", "2026-11-20 15:00", False),
        ("sa Lunes ng 10am", "2026-11-23 10:00", False),
        ("mamayang 3pm", "2026-11-18 15:00", False),
        ("alas-2", "2026-11-18 14:00", False),
        ("mamaya", "2026-11-18 17:00", True),
        ("this week's", "2026-11-20 17:00", True),
    ],
)
def test_filipino_and_same_day_phrases_resolve(phrase, expected, ambiguous):
    result = resolve_date(phrase, received_at=RECEIVED, timezone=MANILA)
    assert result.value is not None
    assert result.value.strftime("%Y-%m-%d %H:%M") == expected
    assert result.ambiguous is ambiguous


@pytest.mark.parametrize(
    "text",
    [
        "You allowed Google Drive for desktop access to some of your Google Account",
        "We received your order",
        "Your export finished",
    ],
)
def test_statements_are_not_tasks(text):
    assert is_statement(text)


@pytest.mark.parametrize(
    "text",
    [
        "review your account activity",
        "Paki-submit ang final budget report",
        "You need to sign the form",
        "Can you send the slides",
    ],
)
def test_requests_stay_tasks(text):
    assert not is_statement(text)


@dataclass
class _S:
    label: str
    text: str
    resolved: object | None = None


def test_filter_drops_unresolved_dates_and_statements():
    spans = [
        _S("DATE", "this"),
        _S("DATE", "bukas", resolved="2026-11-19"),
        _S("TASK", "You allowed access"),
        _S("TASK", "review your account activity"),
    ]
    kept = filter_spans(spans, promotional=False)
    assert [s.text for s in kept] == ["bukas", "review your account activity"]


def test_promotional_mail_keeps_no_tasks_or_dates():
    spans = [_S("TASK", "Shop now"), _S("DATE", "today", resolved="2026-11-18")]
    assert filter_spans(spans, promotional=True) == []
