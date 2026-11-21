import os

os.environ["CATEGORAIZE_INTERNAL_KEY"] = "test-internal-key"
os.environ["CATEGORAIZE_SKIP_MODEL_LOAD"] = "1"
# The suite sends many requests quickly; test_hardening.py turns the limiter on itself.
os.environ["CATEGORAIZE_RATE_LIMIT_PER_MINUTE"] = "0"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.embeddings import model_manager
from app.services.tagger import tagger_manager

AUTH = {"X-Internal-Key": "test-internal-key"}
RECEIVED_AT = "2026-11-09T09:00:00+08:00"  # a Monday morning in Manila
TIMEZONE = "Asia/Manila"

CATEGORIES = [
    {
        "id": "cat-academics",
        "name": "School",
        "description": "University coursework: classes, assignments, exams, grades, professors and thesis.",
        "base_priority": 3,
    },
    {
        "id": "cat-finance",
        "name": "Bills and Payments",
        "description": "Bills and utility statements (electricity, water, internet), credit card statements, invoices, receipts, amounts due and payment confirmations.",
        "base_priority": 3,
    },
    {
        "id": "cat-deliveries",
        "name": "Orders",
        "description": "Online shopping order confirmations, shipping updates and package delivery tracking.",
        "base_priority": 2,
    },
]


@pytest.fixture(scope="session")
def loaded_model():
    if not model_manager.ready:
        model_manager.load()
    assert model_manager.ready, model_manager.error
    return model_manager


@pytest.fixture
def client(loaded_model):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def fresh_tagger(monkeypatch):
    """Reload the span tagger after env changes made through the returned monkeypatch."""
    tagger_manager.reset()
    yield monkeypatch
    tagger_manager.reset()


@pytest.fixture
def regex_tagger(fresh_tagger):
    fresh_tagger.setenv("CATEGORAIZE_TAGGER", "regex")
    return fresh_tagger


@pytest.fixture
def unloaded_client():
    previous = model_manager.status
    model_manager.status = "loading"
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        model_manager.status = previous


def classify_payload(**overrides):
    payload = {
        "email_id": "email-1",
        "subject": "",
        "body": "",
        "received_at": RECEIVED_AT,
        "timezone": TIMEZONE,
        "sender": {"email": "someone@example.com", "role": None, "is_vip": False},
        "categories": CATEGORIES,
        "threshold": 0.35,
        "now": RECEIVED_AT,
    }
    payload.update(overrides)
    return payload


def _case_text(value) -> str:
    if isinstance(value, str):
        return value
    import json

    return json.dumps(value, ensure_ascii=False, default=str)


@pytest.fixture
def case(record_property):
    """Record a component test case (Prompt A) in the JUnit XML.

    The case id comes from the pytest param id ("C3-01 bukas") or `tc=`;
    scripts/testing/make_component_report.py turns these into the report.
    """

    def record(input, expected, actual, tc=None):
        if tc:
            record_property("tc_id", tc)
        record_property("input", _case_text(input)[:300])
        record_property("expected", _case_text(expected)[:300])
        record_property("actual", _case_text(actual)[:300])
        return actual

    return record
