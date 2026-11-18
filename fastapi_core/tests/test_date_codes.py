from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.nlp.date_codes import has_conflict, phrase_to_code, resolve, resolve_phrase
from eval.loaders import load_split

MANILA = ZoneInfo("Asia/Manila")
MONDAY = datetime(2026, 11, 16, 9, 0, tzinfo=MANILA)


@pytest.mark.parametrize(
    ("phrase", "expected"),
    [
        ("bukas", "2026-11-17"),
        ("bukas ng alas-dos ng hapon", "2026-11-17T14:00:00+08:00"),
        ("tomorrow 9 AM", "2026-11-17T09:00:00+08:00"),
        ("10 AM bukas", "2026-11-17T10:00:00+08:00"),
        ("mamaya", "2026-11-16"),
        ("mamayang alas-tres", "2026-11-16T15:00:00+08:00"),
        ("ngayon", "2026-11-16"),
        ("alas-singko ng hapon ngayon", "2026-11-16T17:00:00+08:00"),
        ("tanghali ngayon", "2026-11-16T12:00:00+08:00"),
        ("mamaya pagkatapos ng tanghalian", "2026-11-16T13:00:00+08:00"),
        ("Disyembre 5", "2026-12-05"),
        ("December 5th", "2026-12-05"),
        ("Nobyembre 10", "2027-11-10"),
        ("katapusan ng araw ng Biyernes", "2026-11-20T17:00:00+08:00"),
        ("Sabado, alas-sais ng gabi", "2026-11-21T18:00:00+08:00"),
        ("Wednesday night", "2026-11-18T21:00:00+08:00"),
        ("next Monday", "2026-11-23"),
        ("sa susunod na Huwebes", "2026-11-26"),
    ],
)
def test_resolves_phrases(phrase, expected):
    assert resolve_phrase(phrase, MONDAY) == (expected, False)


@pytest.mark.parametrize(
    ("weekday", "day"),
    [("Lunes", 23), ("Martes", 17), ("Miyerkules", 18), ("Huwebes", 19), ("Biyernes", 20), ("Sabado", 21),
     ("Linggo", 22)],
)
def test_filipino_weekdays_are_strictly_after_the_received_day(weekday, day):
    assert resolve_phrase(weekday, MONDAY) == (f"2026-11-{day}", False)


@pytest.mark.parametrize(
    "phrase", ["next week", "sometime next week", "sa susunod na linggo", "ngayong linggo", "soon", "ASAP", "", "?!"]
)
def test_vague_phrases_are_ambiguous(phrase):
    assert resolve_phrase(phrase, MONDAY) == (None, True)


def test_resolve_matches_the_dataset_codes():
    assert resolve("+1@14:00", MONDAY) == ("2026-11-17T14:00:00+08:00", False)
    assert resolve("mon", MONDAY) == ("2026-11-23", False)
    assert resolve("nxt:wed", MONDAY) == ("2026-11-25", False)
    assert resolve("?", MONDAY) == (None, True)
    assert phrase_to_code("Huwebes ng umaga", MONDAY) == "thu@09:00"


def test_conflicts_need_a_timed_date_inside_a_busy_period():
    busy = [(datetime(2026, 11, 17, 13, 30, tzinfo=MANILA), datetime(2026, 11, 17, 15, 0, tzinfo=MANILA))]
    assert has_conflict(["2026-11-17T14:00:00+08:00"], busy)
    assert not has_conflict(["2026-11-17T15:00:00+08:00"], busy)  # end is exclusive
    assert not has_conflict(["2026-11-17"], busy)  # date-only never conflicts
    assert not has_conflict([None], busy)  # ambiguous never conflicts
    assert not has_conflict(["2026-11-17T14:00:00+08:00"], None)  # no calendar data, no conflict


@pytest.mark.parametrize("split", ["train", "dev"])
def test_every_gold_date_phrase_resolves_like_the_labels(split):
    misses = [
        (record.id, span.text)
        for record in load_split(split)
        for span in record.gold_spans
        if span.label == "DATE" and resolve_phrase(span.text, record.received_at) != (span.resolved, span.ambiguous)
    ]
    assert misses == []
