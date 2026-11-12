import os

os.environ["CATEGORAIZE_INTERNAL_KEY"] = "test-internal-key"
os.environ["CATEGORAIZE_SKIP_MODEL_LOAD"] = "1"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.embeddings import model_manager

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
