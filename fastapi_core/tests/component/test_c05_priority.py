"""C5 Priority model and guardrails."""

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from conftest import AUTH

from app.ml.priority_model import apply_guardrails
from app.ml.priority_rules import compute_priority
from app.services.learned import learned_models

MONDAY = "2026-11-16T09:00:00+08:00"
TASK_BODY = "Please send the updated budget file by Friday."
NO_TASK_BODY = "FYI, the office will be closed on the holiday. No action needed."


def _priority(client, body=TASK_BODY, **overrides):
    payload = {"subject": "Budget", "body": body, "received_at": MONDAY,
               "sender": {"role": "Other", "is_vip": False}} | overrides
    response = client.post("/api/v1/priority", headers=AUTH, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(("tc", "level", "vip", "task", "category", "override", "expected"), [
    pytest.param("C5-01", 2, True, True, None, None, (4, ["vip_floor"]), id="C5-01 VIP with task raised to P4"),
    pytest.param("C5-02", 2, True, False, None, None, (2, []), id="C5-02 VIP without task not raised"),
    pytest.param("C5-03", 5, False, True, "promotions", None, (2, ["promotion_cap"]), id="C5-03 promotion capped at P2"),
    pytest.param("C5-04", 5, True, True, "promotions", None, (2, ["promotion_cap"]), id="C5-04 promotion cap beats VIP floor"),
    pytest.param("C5-05", 4, True, True, None, 1, (1, ["manual_override"]), id="C5-05 manual override wins over VIP floor"),
    pytest.param("C5-06", 1, False, True, "promotions", 5, (5, ["manual_override"]), id="C5-06 manual override wins over promotion cap"),
])
def test_guardrails(case, tc, level, vip, task, category, override, expected):
    actual = apply_guardrails(level, is_vip=vip, has_task=task, category=category, override=override)
    case({"model_level": level, "vip": vip, "task": task, "category": category, "override": override},
         {"level": expected[0], "guardrails": expected[1]}, {"level": actual[0], "guardrails": actual[1]})
    assert actual == expected


def test_endpoint_vip_with_task_is_at_least_p4(client, case):
    body = _priority(client, sender={"role": "Other", "is_vip": True})
    case("VIP sender, task 'send the budget file'", "level >= 4", body["level"], tc="C5-07")
    assert body["level"] >= 4 and body["has_task"]


def test_endpoint_override_always_wins(client, case):
    levels = [_priority(client, sender={"role": "Director/Executive", "is_vip": True}, override_priority=n)["level"]
              for n in range(1, 6)]
    case("override_priority 1..5 for a VIP director with a task", [1, 2, 3, 4, 5], levels, tc="C5-08")
    assert levels == [1, 2, 3, 4, 5]


def test_endpoint_promotion_capped(client, case):
    body = _priority(client, body="Shop now! 70% off everything, pay by tomorrow!", is_promotion=True,
                     sender={"role": "Other", "is_vip": True})
    case("promotional email from a VIP with a deadline", "level <= 2", body["level"], tc="C5-09")
    assert body["level"] <= 2


def test_missing_calendar_never_lowers_learned_priority(client, case):
    none = _priority(client)["level"]
    empty = _priority(client, calendar_busy=[])["level"]
    busy = _priority(client, calendar_busy=[{"start": "2026-11-20T08:00:00+08:00", "end": "2026-11-20T18:00:00+08:00"}])["level"]
    case("same email with calendar None / [] / busy all Friday", "None >= [] and None >= busy",
         {"none": none, "empty": empty, "busy": busy}, tc="C5-10")
    assert none >= empty and none >= busy


def test_missing_calendar_never_lowers_rule_priority(case):
    now = datetime(2026, 11, 16, 9, tzinfo=ZoneInfo("Asia/Manila"))
    deadline = [datetime(2026, 11, 17, 15, tzinfo=ZoneInfo("Asia/Manila"))]
    common = dict(base_priority=3, validated_deadlines=deadline, now=now, sender_role="Other", is_vip=False)
    missing = compute_priority(**common, calendar_busy=None).level
    free = compute_priority(**common, calendar_busy=[]).level
    case("rule priority with calendar None vs []", "equal (missing data is not 'free')", {"none": missing, "empty": free},
         tc="C5-11")
    assert missing == free


def test_ambiguous_date_never_raises_urgency(client, case):
    vague = _priority(client, body="Please send the updated budget file sometime next week.")
    plain = _priority(client, body="Please send the updated budget file.")
    case("'sometime next week' vs no date", "same level, proximity 0",
         {"vague": [vague["level"], vague["deadline_proximity"]], "no_date": [plain["level"], plain["deadline_proximity"]]},
         tc="C5-12")
    assert vague["deadline_proximity"] == 0.0 and vague["level"] == plain["level"]


def test_why_list_returns_top_three_distinct_factors(client, case):
    why = _priority(client, sender={"role": "Manager", "is_vip": False})["why"]
    factors = [item["factor"] for item in why]
    case("learned priority for a manager's task email", "3 distinct factors", factors, tc="C5-13")
    assert len(factors) == 3 and len(set(factors)) == 3


def test_why_list_is_sorted_by_strength(client, case):
    why = _priority(client)["why"]
    strengths = [abs(item["contribution"]) for item in why]
    case("contributions of the why-list", "descending by absolute value", strengths, tc="C5-14")
    assert strengths == sorted(strengths, reverse=True)


def test_rules_fallback_when_no_model(client, case, monkeypatch, tmp_path):
    monkeypatch.setenv("CATEGORAIZE_MODELS_DIR", str(tmp_path))
    learned_models.reset()
    try:
        body = _priority(client, sender={"role": "Other", "is_vip": True})
        case("no priority model file; VIP with task", "source rules, level >= 4", [body["source"], body["level"]], tc="C5-15")
        assert body["source"] == "rules" and body["level"] >= 4
    finally:
        monkeypatch.delenv("CATEGORAIZE_MODELS_DIR")
        learned_models.reset()


def test_vip_without_task_is_not_floored_by_endpoint(client, case):
    body = _priority(client, body=NO_TASK_BODY, sender={"role": "Other", "is_vip": True})
    case("VIP sender, FYI email with no task", "no vip_floor guardrail", [body["has_task"], body["guardrails"]], tc="C5-16")
    assert "vip_floor" not in body["guardrails"]
