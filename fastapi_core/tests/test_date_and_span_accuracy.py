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


# Second inbox-review pass (synthetic examples of each pattern).
from app.nlp.bulk_mail import detect_bulk, is_urgent_notice  # noqa: E402
from app.nlp.span_filter import is_date_phrase  # noqa: E402

RECEIVED_24 = datetime(2026, 11, 24, 14, 36, tzinfo=ZoneInfo(MANILA))


@pytest.mark.parametrize(
    ("phrase", "expected"),
    [
        ("Nov 24", "2026-11-24 17:00"),  # same day stays this year
        ("24 November at 21", "2026-11-24 21:00"),  # not the year 2121
        ("22 Nov 2026 22:08", "2026-11-22 22:08"),  # 24-hour receipt time
        ("2026-11-22 15:10:58", "2026-11-22 15:10"),
        ("Jan 10", "2027-01-10 17:00"),  # a later month still rolls forward
    ],
)
def test_year_and_clock_resolution(phrase, expected):
    result = resolve_date(phrase, received_at=RECEIVED_24, timezone=MANILA)
    assert result.value.strftime("%Y-%m-%d %H:%M") == expected


@pytest.mark.parametrize("text", ["1", "5th", "16th and 17th", "2020", "₱ 7.28", "now", "an afternoon", "now · 2"])
def test_numbers_amounts_and_vague_words_are_not_dates(text):
    assert not is_date_phrase(text)


@pytest.mark.parametrize("text", ["bukas", "Nov 24", "next week", "in 3 days", "5pm", "alas-3", "22:08", "11/30"])
def test_real_date_phrases_are_dates(text):
    assert is_date_phrase(text)


def test_essay_keeps_only_explicit_requests():
    spans = [_S("TASK", f"sentence number {n} about life") for n in range(8)] + [_S("TASK", "please reply by Friday")]
    assert [s.text for s in filter_spans(spans, promotional=False)] == ["please reply by Friday"]


def test_automated_notice_keeps_only_requests_without_negation():
    spans = [_S("TASK", "Paste this link"), _S("TASK", "you don't need to do anything"), _S("TASK", "please contact support")]
    assert [s.text for s in filter_spans(spans, promotional=False, automated=True)] == ["please contact support"]


@pytest.mark.parametrize(
    ("sender", "promotional", "newsletter", "automated"),
    [
        ("writer@substack.com", True, True, False),
        ("contact@info.shop.example.com", True, False, False),
        ("no-reply-x@mail.service.example.com", False, False, True),
    ],
)
def test_sender_domains(sender, promotional, newsletter, automated):
    signals = detect_bulk("Hello", "Some text.", sender)
    assert (signals.promotional, signals.newsletter, signals.automated) == (promotional, newsletter, automated)


def test_notification_footer_on_a_noreply_notice_is_not_promotional():
    signals = detect_bulk(
        "Run failed: Build Check",
        "You are receiving this because you are subscribed to this thread. Manage your notifications.",
        "notifications@code.example.com",
    )
    assert signals.automated and not signals.promotional


def test_urgent_notices_are_never_promotional():
    assert is_urgent_notice("Security alert")
    signals = detect_bulk("Security alert", "Unsubscribe from these alerts.", "no-reply@accounts.example.com")
    assert not signals.promotional


# Third pass, from the labelled dev set: Spanish hours, end-of-day weekdays,
# day parts and "after lunch".
RECEIVED_17 = datetime(2026, 11, 17, 9, 0, tzinfo=ZoneInfo(MANILA))  # a Tuesday


@pytest.mark.parametrize(
    ("phrase", "expected", "ambiguous"),
    [
        ("alas-singko ng hapon ngayon", "2026-11-17 17:00", False),
        ("mamayang alas-tres", "2026-11-17 15:00", False),
        ("Miyerkules, alas-nuwebe ng umaga", "2026-11-18 09:00", False),
        ("katapusan ng araw ng Biyernes", "2026-11-20 17:00", False),
        ("end of day Friday", "2026-11-20 17:00", False),
        ("this afternoon", "2026-11-17 15:00", False),
        ("alas-dos y medya", "2026-11-17 14:30", False),
        ("mamaya pagkatapos ng tanghalian", "2026-11-17 13:00", True),
        ("later after lunch", "2026-11-17 13:00", True),
    ],
)
def test_third_pass_phrases(phrase, expected, ambiguous):
    result = resolve_date(phrase, received_at=RECEIVED_17, timezone=MANILA)
    assert result.value is not None
    assert result.value.strftime("%Y-%m-%d %H:%M") == expected
    assert result.ambiguous is ambiguous


def test_unresolved_date_with_a_date_word_is_kept_for_review():
    spans = [_S("DATE", "sometime next week"), _S("DATE", "TESTS"), _S("DATE", "day 2")]
    assert [s.text for s in filter_spans(spans, promotional=False)] == ["sometime next week"]
