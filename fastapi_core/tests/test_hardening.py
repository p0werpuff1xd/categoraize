"""IAS Phase 10 H: payload limits, rate limiting, 401 counting, no CORS,
and no email content in logs."""

import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.security import auth_failures, rate_limiter
from conftest import AUTH, classify_payload


@pytest.fixture
def bare_client():
    """A client that does not need the model (auth, limits, health)."""
    with TestClient(app) as client:
        yield client


def test_oversized_payload_is_rejected_before_parsing(bare_client, monkeypatch):
    monkeypatch.setenv("CATEGORAIZE_MAX_BODY_BYTES", "1000")
    response = bare_client.post(
        "/api/v1/embed", content=b'{"texts": ["' + b"a" * 2000 + b'"]}', headers={**AUTH, "content-type": "application/json"}
    )
    assert response.status_code == 413


def test_post_without_content_length_is_rejected(bare_client):
    def chunks():
        yield b'{"texts": ["hi"]}'

    response = bare_client.post("/api/v1/embed", content=chunks(), headers={**AUTH, "content-type": "application/json"})
    assert response.status_code == 411


def test_rate_limit_returns_429_with_retry_after(bare_client, monkeypatch):
    monkeypatch.setenv("CATEGORAIZE_RATE_LIMIT_PER_MINUTE", "3")
    rate_limiter.reset()
    try:
        statuses = [bare_client.post("/api/v1/embed", json={"texts": ["x"]}).status_code for _ in range(4)]
        assert statuses[:3] == [401, 401, 401]  # counted even when rejected for auth
        assert statuses[3] == 429
        limited = bare_client.post("/api/v1/embed", json={"texts": ["x"]})
        assert int(limited.headers["Retry-After"]) >= 1
        # Health checks are never rate-limited.
        assert bare_client.get("/healthz").status_code in (200, 503)
    finally:
        rate_limiter.reset()


def test_rate_limiter_window_slides():
    rate_limiter.reset()
    assert rate_limiter.check("c", 2, now=0.0) is None
    assert rate_limiter.check("c", 2, now=1.0) is None
    assert rate_limiter.check("c", 2, now=2.0) is not None
    assert rate_limiter.check("c", 2, now=61.0) is None  # the first hit left the window
    assert rate_limiter.check("other", 2, now=2.0) is None  # per client
    rate_limiter.reset()


def test_auth_failures_are_counted_and_shown_on_healthz(bare_client, caplog):
    before = auth_failures.count
    with caplog.at_level(logging.WARNING, logger="categoraize.security"):
        response = bare_client.post("/api/v1/embed", json={"texts": ["x"]}, headers={"X-Internal-Key": "wrong-key-123"})
    assert response.status_code == 401
    assert auth_failures.count == before + 1
    assert bare_client.get("/healthz").json()["auth_failures"] == before + 1
    assert "wrong-key-123" not in caplog.text


def test_no_cors_headers(bare_client):
    response = bare_client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in {key.lower() for key in response.headers}
    preflight = bare_client.options(
        "/api/v1/classify",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in {key.lower() for key in preflight.headers}


def test_email_content_never_reaches_the_logs(client, caplog):
    marker = "CONFIDENTIAL-MARKER-7f3a"
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            "/api/v1/classify",
            json=classify_payload(subject=f"Subject {marker}", body=f"Paki-send ang report bukas. {marker}"),
            headers=AUTH,
        )
    assert response.status_code == 200
    assert marker not in caplog.text
