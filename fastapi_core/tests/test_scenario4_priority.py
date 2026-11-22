"""Scenario 4: a validated near-term deadline raises priority versus an
otherwise identical email, with the factor breakdown returned."""

from datetime import datetime, timedelta, timezone

from app.ml.priority_rules import compute_priority
from conftest import AUTH, classify_payload

NOW = datetime(2026, 11, 9, 9, 0, tzinfo=timezone(timedelta(hours=8)))


def _priority(**overrides):
    arguments = {
        "base_priority": 3,
        "validated_deadlines": [],
        "now": NOW,
        "sender_role": None,
        "is_vip": False,
        "calendar_busy": None,
    }
    arguments.update(overrides)
    return compute_priority(**arguments)


def test_near_deadline_raises_priority_through_api(client):
    without = classify_payload(subject="Quarterly report", body="Please submit the quarterly report.")
    with_deadline = classify_payload(subject="Quarterly report", body="Please submit the quarterly report tomorrow.")
    plain = client.post("/api/v1/classify", json=without, headers=AUTH).json()["priority"]
    urgent = client.post("/api/v1/classify", json=with_deadline, headers=AUTH).json()["priority"]

    assert plain["factors"]["deadline"] == 0
    assert urgent["factors"]["deadline"] == 1  # tomorrow 17:00 is 32 h away: within 72 h
    assert urgent["level"] > plain["level"]
    assert urgent["deadline"] is not None
    assert set(urgent["factors"]) == {"category_base", "deadline", "sender_role", "calendar", "vip_pin"}


def test_deadline_windows():
    assert _priority(validated_deadlines=[NOW + timedelta(hours=10)]).factors["deadline"] == 2
    assert _priority(validated_deadlines=[NOW - timedelta(hours=5)]).factors["deadline"] == 2  # overdue
    assert _priority(validated_deadlines=[NOW + timedelta(hours=48)]).factors["deadline"] == 1
    assert _priority(validated_deadlines=[NOW + timedelta(days=5)]).factors["deadline"] == 0


def test_ambiguous_date_does_not_count_until_confirmed(client):
    body = "Please send the slides next Friday."
    unconfirmed = client.post("/api/v1/classify", json=classify_payload(body=body), headers=AUTH).json()
    date_spans = [span for span in unconfirmed["spans"] if span["label"] == "DATE"]
    assert date_spans and date_spans[0]["ambiguous"] is True
    assert unconfirmed["priority"]["factors"]["deadline"] == 0

    confirmed = classify_payload(body=body, confirmed_deadlines=["2026-11-09T17:00:00+08:00"])
    result = client.post("/api/v1/classify", json=confirmed, headers=AUTH).json()
    assert result["priority"]["factors"]["deadline"] == 2


def test_role_vip_clamp_and_calendar():
    assert _priority(sender_role="Director/Executive").factors["sender_role"] == 2
    assert _priority(sender_role="Manager").factors["sender_role"] == 1
    assert _priority(sender_role="External Vendor").factors["sender_role"] == 0

    vip = _priority(base_priority=1, is_vip=True)
    assert vip.level == 4 and vip.factors["vip_pin"] == 3

    maxed = _priority(base_priority=5, sender_role="Director/Executive", validated_deadlines=[NOW])
    assert maxed.level == 5

    deadline = NOW + timedelta(hours=30)
    busy = [(deadline - timedelta(hours=1), deadline + timedelta(hours=1))]
    assert _priority(validated_deadlines=[deadline], calendar_busy=busy).factors["calendar"] == 1
    # No calendar access: no boost, and never treated as low urgency.
    no_access = _priority(validated_deadlines=[deadline], calendar_busy=None)
    assert no_access.factors["calendar"] == 0
    assert no_access.level == 4


def test_past_dates_are_not_deadlines(client):
    body = "Please read the notes from yesterday's meeting."
    result = client.post("/api/v1/classify", json=classify_payload(body=body), headers=AUTH).json()
    assert all(not span["is_deadline"] for span in result["spans"] if span["label"] == "DATE")
    assert result["priority"]["factors"]["deadline"] == 0
