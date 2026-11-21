"""C7 Calendar conflict: a timed, non-ambiguous DATE inside a busy period.
Busy periods are [start, end): the start is inclusive, the end exclusive."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from conftest import AUTH

from app.nlp.date_codes import has_conflict

MANILA = ZoneInfo("Asia/Manila")


def m(day, hour, minute=0):
    return datetime(2026, 11, day, hour, minute, tzinfo=MANILA)


CASES = [
    ("C7-01", "deadline inside a busy block", ["2026-11-17T14:00:00+08:00"], [(m(17, 13), m(17, 15))], True),
    ("C7-02", "deadline exactly at the start (inclusive)", ["2026-11-17T13:00:00+08:00"], [(m(17, 13), m(17, 15))], True),
    ("C7-03", "deadline exactly at the end (exclusive)", ["2026-11-17T15:00:00+08:00"], [(m(17, 13), m(17, 15))], False),
    ("C7-04", "deadline one minute before the start", ["2026-11-17T12:59:00+08:00"], [(m(17, 13), m(17, 15))], False),
    ("C7-05", "multi-day busy block covers day 2", ["2026-11-18T10:00:00+08:00"], [(m(17, 9), m(19, 18))], True),
    ("C7-06", "busy block given in UTC, same instant",
     ["2026-11-17T14:00:00+08:00"],
     [(datetime(2026, 11, 17, 5, tzinfo=timezone.utc), datetime(2026, 11, 17, 7, tzinfo=timezone.utc))], True),
    ("C7-07", "busy block in UTC that is a different Manila hour",
     ["2026-11-17T14:00:00+08:00"],
     [(datetime(2026, 11, 17, 13, tzinfo=timezone.utc), datetime(2026, 11, 17, 15, tzinfo=timezone.utc))], False),
    ("C7-08", "calendar data missing (None)", ["2026-11-17T14:00:00+08:00"], None, False),
    ("C7-09", "calendar connected but empty", ["2026-11-17T14:00:00+08:00"], [], False),
    ("C7-10", "date-only deadline never conflicts", ["2026-11-17"], [(m(17, 0), m(18, 0))], False),
    ("C7-11", "ambiguous date (no value) never conflicts", [None], [(m(16, 0), m(30, 0))], False),
    ("C7-12", "one of several dates conflicts", ["2026-11-17T09:00:00+08:00", "2026-11-18T14:00:00+08:00"],
     [(m(18, 13), m(18, 15))], True),
]


@pytest.mark.parametrize(("tc", "label", "dates", "busy", "expected"), [pytest.param(*c, id=f"{c[0]} {c[1]}") for c in CASES])
def test_conflict(case, tc, label, dates, busy, expected):
    actual = has_conflict(dates, busy)
    case({"dates": dates, "busy": [[s.isoformat(), e.isoformat()] for s, e in busy] if busy else busy}, expected, actual)
    assert actual is expected


def test_endpoint_reports_conflict_only_with_calendar_data(client, case):
    payload = {"body": "Please send the signed contract by tomorrow 3 PM.", "received_at": "2026-11-16T09:00:00+08:00"}
    with_busy = client.post("/api/v1/tasks", headers=AUTH, json=payload | {
        "calendar_busy": [{"start": "2026-11-17T06:00:00Z", "end": "2026-11-17T08:00:00Z"}]}).json()
    without = client.post("/api/v1/tasks", headers=AUTH, json=payload).json()
    actual = {"with_busy": [with_busy["calendar_checked"], with_busy["calendar_conflict"]],
              "no_calendar": [without["calendar_checked"], without["calendar_conflict"]]}
    case("deadline tomorrow 3 PM Manila; busy 06:00-08:00 UTC (14:00-16:00 Manila) vs no calendar",
         {"with_busy": [True, True], "no_calendar": [False, False]}, actual, tc="C7-13")
    assert actual == {"with_busy": [True, True], "no_calendar": [False, False]}
