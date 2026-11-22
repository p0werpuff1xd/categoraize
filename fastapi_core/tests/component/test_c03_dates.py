"""C3 Date phrase normalizer and resolver (Asia/Manila, UTC+8, no DST)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from conftest import AUTH

from app.ml.priority_model import deadline_proximity
from app.nlp.date_codes import has_conflict, resolve_phrase

MANILA = ZoneInfo("Asia/Manila")
MONDAY = datetime(2026, 11, 16, 9, 0, tzinfo=MANILA)

CASES = [
    ("C3-01", "bukas", MONDAY, "2026-11-17", False),
    ("C3-02", "mamaya", MONDAY, "2026-11-16", False),
    ("C3-03", "ngayon", MONDAY, "2026-11-16", False),
    ("C3-04", "Lunes", MONDAY, "2026-11-23", False),
    ("C3-05", "Martes", MONDAY, "2026-11-17", False),
    ("C3-06", "Miyerkules", MONDAY, "2026-11-18", False),
    ("C3-07", "Huwebes", MONDAY, "2026-11-19", False),
    ("C3-08", "Biyernes", MONDAY, "2026-11-20", False),
    ("C3-09", "Sabado", MONDAY, "2026-11-21", False),
    ("C3-10", "Linggo", MONDAY, "2026-11-22", False),
    ("C3-11", "alas-dos ng hapon", MONDAY, "2026-11-16T14:00:00+08:00", False),
    ("C3-12", "bukas ng alas-dos ng hapon", MONDAY, "2026-11-17T14:00:00+08:00", False),
    ("C3-13", "Disyembre 5", MONDAY, "2026-12-05", False),
    ("C3-14", "next Wednesday", MONDAY, "2026-11-25", False),
    ("C3-15", "sometime next week", MONDAY, None, True),
    ("C3-16", "sa susunod na linggo", MONDAY, None, True),
    ("C3-17", "bukas (month rollover, received Nov 30)", datetime(2026, 11, 30, 10, 0, tzinfo=MANILA), "2026-12-01", False),
    ("C3-18", "bukas (year rollover, received Dec 31)", datetime(2026, 12, 31, 10, 0, tzinfo=MANILA), "2027-01-01", False),
    ("C3-19", "Enero 3 (received Dec 20, next year)", datetime(2026, 12, 20, 10, 0, tzinfo=MANILA), "2027-01-03", False),
    ("C3-20", "bukas (received 23:59)", datetime(2026, 11, 16, 23, 59, tzinfo=MANILA), "2026-11-17", False),
    ("C3-21", "ngayon (received 00:01)", datetime(2026, 11, 17, 0, 1, tzinfo=MANILA), "2026-11-17", False),
]


@pytest.mark.parametrize(("tc", "phrase", "received", "expected", "ambiguous"),
                         [pytest.param(*row, id=f"{row[0]} {row[1]}") for row in CASES])
def test_phrase_resolution(case, tc, phrase, received, expected, ambiguous):
    text = phrase.split(" (")[0]
    actual = resolve_phrase(text, received)
    case(f"'{text}' received {received.isoformat()}", {"resolved": expected, "ambiguous": ambiguous},
         {"resolved": actual[0], "ambiguous": actual[1]})
    assert actual == (expected, ambiguous)


def test_manila_offset_is_fixed_all_year(case):
    offsets = {datetime(2026, month, 1, 12, tzinfo=MANILA).utcoffset().total_seconds() / 3600 for month in range(1, 13)}
    case("UTC offset of Asia/Manila in every month of 2026", "{8.0} (no DST)", sorted(offsets), tc="C3-22")
    assert offsets == {8.0}


def test_ambiguous_date_never_counts_as_conflict(case):
    resolved, _ = resolve_phrase("sometime next week", MONDAY)
    busy = [(datetime(2026, 11, 16, tzinfo=MANILA), datetime(2026, 11, 30, tzinfo=MANILA))]
    actual = has_conflict([resolved], busy)
    case("'sometime next week' with a two-week busy block", "no conflict", actual, tc="C3-23")
    assert actual is False


def test_ambiguous_date_never_raises_urgency(case):
    resolved, _ = resolve_phrase("sometime next week", MONDAY)
    actual = deadline_proximity([resolved], MONDAY)
    case("deadline proximity of 'sometime next week'", 0.0, actual, tc="C3-24")
    assert actual == 0.0


def test_utc_received_at_resolves_in_manila_time(client, case):
    # 16:30 UTC on Nov 16 is 00:30 on Nov 17 in Manila, so "bukas" is Nov 18.
    response = client.post("/api/v1/tasks", headers=AUTH, json={
        "body": "Please send the report bukas.", "received_at": "2026-11-16T16:30:00+00:00", "timezone": "Asia/Manila"})
    dates = [span["resolved"] for span in response.json()["spans"] if span["label"] == "DATE"]
    case("'bukas' received 2026-11-16T16:30Z (00:30 in Manila)", ["2026-11-18"], dates, tc="C3-25")
    assert dates == ["2026-11-18"]
