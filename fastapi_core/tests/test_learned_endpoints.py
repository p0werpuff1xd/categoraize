import pytest
from conftest import AUTH

from app.services.learned import learned_models

MONDAY = "2026-11-16T09:00:00+08:00"


def _post(client, path, payload, headers=AUTH):
    return client.post(path, json=payload, headers=headers)


def _dates(body):
    return [span for span in body["spans"] if span["label"] == "DATE"]


@pytest.mark.parametrize("path", ["/api/v1/tasks", "/api/v1/register", "/api/v1/priority"])
def test_endpoints_require_the_internal_key(client, path):
    payload = {"subject": "x", "body": "y", "received_at": MONDAY}
    assert _post(client, path, payload, headers={}).status_code == 401
    assert _post(client, path, payload, headers={"X-Internal-Key": "wrong"}).status_code == 401


def test_tasks_english_resolves_and_flags_a_conflict(client):
    response = _post(client, "/api/v1/tasks", {
        "subject": "Contract",
        "body": "Hi Alex, please send the signed contract by tomorrow 3 PM. Thanks.",
        "received_at": MONDAY,
        "calendar_busy": [{"start": "2026-11-17T14:00:00+08:00", "end": "2026-11-17T16:00:00+08:00"}],
    })
    body = response.json()
    assert response.status_code == 200
    assert any(span["label"] == "TASK" for span in body["spans"])
    assert "2026-11-17T15:00:00+08:00" in [span["resolved"] for span in _dates(body)]
    assert body["calendar_checked"] and body["calendar_conflict"]


def test_tasks_taglish_date_only_deadline_never_conflicts(client):
    response = _post(client, "/api/v1/tasks", {
        "subject": "Slides",
        "body": "Hi team, paki-send ang final slides bago mag-Friday. Salamat!",
        "received_at": MONDAY,
        "calendar_busy": [{"start": "2026-11-20T08:00:00+08:00", "end": "2026-11-20T18:00:00+08:00"}],
    })
    body = response.json()
    assert "2026-11-20" in [span["resolved"] for span in _dates(body)]
    assert body["calendar_conflict"] is False


def test_tasks_filipino_resolves_alas_dos_ng_hapon(client):
    response = _post(client, "/api/v1/tasks", {
        "subject": "Ulat",
        "body": "Magandang umaga po. Pakipadala po ang buwanang ulat bukas ng alas-dos ng hapon.",
        "received_at": MONDAY,
    })
    body = response.json()
    assert "2026-11-17T14:00:00+08:00" in [span["resolved"] for span in _dates(body)]
    assert body["calendar_checked"] is False and body["calendar_conflict"] is False


def test_tasks_vague_dates_are_ambiguous(client):
    body = _post(client, "/api/v1/tasks", {
        "body": "Please review the draft sometime next week.", "received_at": MONDAY,
    }).json()
    assert all(span["ambiguous"] and span["resolved"] is None for span in _dates(body))


@pytest.mark.parametrize(
    ("subject", "body", "expected"),
    [
        ("Paalala", "Magandang umaga po. Mangyaring ipasa po ang inyong mga dokumento. Maraming salamat po.", "formal"),
        ("tara", "uy tara kain tayo mamaya haha 😂 libre ko na", "casual"),
    ],
)
def test_register_formal_and_casual(client, subject, body, expected):
    response = _post(client, "/api/v1/register", {"subject": subject, "body": body})
    assert response.status_code == 200
    assert response.json()["register"] == expected


def _priority(client, **overrides):
    payload = {
        "subject": "Budget",
        "body": "Please send the updated budget file by Friday.",
        "received_at": MONDAY,
        "sender": {"role": "Other", "is_vip": False},
    } | overrides
    response = _post(client, "/api/v1/priority", payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_priority_returns_a_level_and_reasons(client):
    body = _priority(client)
    assert 1 <= body["level"] <= 5
    assert body["has_task"] is True
    assert 1 <= len(body["why"]) <= 3


def test_vip_with_a_task_is_at_least_p4(client):
    body = _priority(client, sender={"role": "Other", "is_vip": True})
    assert body["level"] >= 4


def test_promotions_are_capped_at_p2_even_for_a_vip(client):
    body = _priority(client, subject="Final sale", body="Shop now and pay by tomorrow to get 50% off!",
                     sender={"role": "Other", "is_vip": True}, is_promotion=True)
    assert body["level"] <= 2


def test_manual_override_wins(client):
    body = _priority(client, sender={"role": "Director/Executive", "is_vip": True}, override_priority=1)
    assert body["level"] == 1
    assert body["guardrails"][-1] == "manual_override"


def test_missing_calendar_data_never_lowers_priority(client):
    without = _priority(client)
    elsewhere = _priority(client, calendar_busy=[
        {"start": "2026-11-25T09:00:00+08:00", "end": "2026-11-25T10:00:00+08:00"}])
    assert without["level"] >= elsewhere["level"]


def test_missing_model_files_fall_back_to_rules(client, monkeypatch, tmp_path):
    monkeypatch.setenv("CATEGORAIZE_MODELS_DIR", str(tmp_path))
    learned_models.reset()
    try:
        priority = _priority(client, sender={"role": "Manager", "is_vip": True})
        register = _post(client, "/api/v1/register", {"body": "Dear Ms. Cruz, kindly confirm. Regards"}).json()
        assert priority["source"] == "rules" and priority["level"] >= 4
        assert register["source"] == "rules" and register["register"] == "formal"
        assert client.get("/healthz").json()["learned_models"]["priority"]["version"] is None
    finally:
        monkeypatch.delenv("CATEGORAIZE_MODELS_DIR")
        learned_models.reset()


def _classify(client, base_priority, **overrides):
    payload = {
        "email_id": "m1",
        "subject": "Report",
        "body": "Hi Alex, please send the quarterly report by tomorrow 3 PM. Thanks.",
        "received_at": MONDAY,
        "timezone": "Asia/Manila",
        "threshold": -1.0,
        "categories": [{"id": "c1", "name": "Work", "description": "Work requests and reports",
                        "base_priority": base_priority}],
    } | overrides
    response = _post(client, "/api/v1/classify", payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_classify_returns_learned_priority_and_register(client):
    body = _classify(client, 3)
    learned = body["learned_priority"]
    assert learned is not None and 1 <= learned["level"] <= 5
    assert learned["category_offset"] == 0
    assert 1 <= len(learned["why"]) <= 3
    assert body["sender_register"]["value"] in {"formal", "neutral", "casual"}


def test_category_base_priority_shifts_the_learned_level(client):
    default, raised = _classify(client, 3)["learned_priority"], _classify(client, 5)["learned_priority"]
    assert raised["category_offset"] == 2
    assert raised["model_level"] == default["model_level"]
    assert raised["level"] == min(5, default["level"] + 2) or "vip_floor" in raised["guardrails"]


def test_ignorable_category_caps_learned_priority_at_p2(client):
    learned = _classify(client, 1, sender={"role": "Director/Executive", "is_vip": True})["learned_priority"]
    assert learned["level"] <= 2


def test_classify_without_a_priority_model_has_no_learned_priority(client, monkeypatch, tmp_path):
    monkeypatch.setenv("CATEGORAIZE_MODELS_DIR", str(tmp_path))
    learned_models.reset()
    try:
        body = _classify(client, 3)
        assert body["learned_priority"] is None
        assert body["sender_register"]["source"] == "rules"
    finally:
        monkeypatch.delenv("CATEGORAIZE_MODELS_DIR")
        learned_models.reset()
