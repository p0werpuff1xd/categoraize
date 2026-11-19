"""C10 API layer: auth on every endpoint, input validation, no content in logs,
statelessness."""

import logging
import re
from pathlib import Path

import pytest
from conftest import AUTH

from app.main import app

PROTECTED = sorted(route.path for route in app.routes if getattr(route, "path", "").startswith("/api/v1/"))
APP_DIR = Path(__file__).resolve().parents[2] / "app"
SECRET_MARKER = "ZQX-PRIVATE-7731 Juan dela Cruz 09171234567"


@pytest.mark.parametrize("path", PROTECTED, ids=[f"C10-A{i:02d} {p} no key" for i, p in enumerate(PROTECTED, start=1)])
def test_missing_key_is_rejected(client, case, path):
    status = client.post(path, json={}).status_code
    case(f"POST {path} without X-Internal-Key", "401", status)
    assert status == 401


@pytest.mark.parametrize("path", PROTECTED, ids=[f"C10-B{i:02d} {p} wrong key" for i, p in enumerate(PROTECTED, start=1)])
def test_wrong_key_is_rejected(client, case, path):
    status = client.post(path, json={}, headers={"X-Internal-Key": "wrong"}).status_code
    case(f"POST {path} with a wrong key", "401", status)
    assert status == 401


@pytest.mark.parametrize("path", PROTECTED, ids=[f"C10-C{i:02d} {p} invalid body" for i, p in enumerate(PROTECTED, start=1)])
def test_invalid_input_is_rejected(client, case, path):
    status = client.post(path, json={"unexpected_field": True, "received_at": "not a date"}, headers=AUTH).status_code
    case(f"POST {path} with a malformed body", "422", status)
    assert status == 422


def test_email_content_never_reaches_the_logs(client, case, caplog, capfd):
    caplog.set_level(logging.DEBUG)
    body = f"Please send the report tomorrow. {SECRET_MARKER}"
    for path, payload in [
        ("/api/v1/classify", {"email_id": "m", "subject": SECRET_MARKER, "body": body,
                              "received_at": "2026-11-16T09:00:00+08:00", "categories": []}),
        ("/api/v1/tasks", {"subject": SECRET_MARKER, "body": body, "received_at": "2026-11-16T09:00:00+08:00"}),
        ("/api/v1/priority", {"subject": SECRET_MARKER, "body": body, "received_at": "2026-11-16T09:00:00+08:00"}),
        ("/api/v1/register", {"subject": SECRET_MARKER, "body": body}),
        ("/api/v1/summarize", {"subject": SECRET_MARKER, "body": body}),
    ]:
        assert client.post(path, json=payload, headers=AUTH).status_code == 200
    out, err = capfd.readouterr()
    captured = caplog.text + out + err
    leaked = [part for part in ("ZQX-PRIVATE-7731", "Juan dela Cruz", "09171234567") if part in captured]
    case("5 endpoints called with a unique marker, a name and a phone number in subject and body",
         "none of them in captured logs or stdout/stderr", leaked or "none found", tc="C10-D01")
    assert leaked == []


def test_service_has_no_database_or_token_access(case):
    pattern = re.compile(r"sqlalchemy|psycopg|asyncpg|prisma|DATABASE_URL|access_token|refresh_token|redis", re.I)
    hits = sorted({f"{path.relative_to(APP_DIR)}" for path in APP_DIR.rglob("*.py") if pattern.search(path.read_text("utf-8"))})
    case("search app/ for database drivers, connection URLs and OAuth tokens", "no matches", hits or "no matches", tc="C10-D02")
    assert hits == []


def test_identical_requests_get_identical_answers(client, case):
    payload = {"email_id": "m", "subject": "Report", "body": "Please send the report by Friday.",
               "received_at": "2026-11-16T09:00:00+08:00",
               "categories": [{"id": "w", "name": "Work", "description": "Work requests"}]}
    first, second = (client.post("/api/v1/classify", json=payload, headers=AUTH).json() for _ in range(2))
    for result in (first, second):
        result.pop("timings_ms")
    case("the same /classify request twice", "identical responses (no state carried over)", first == second, tc="C10-D03")
    assert first == second


def test_health_is_public_but_reveals_no_secrets(client, case):
    body = client.get("/healthz").json()
    text = str(body)
    case("GET /healthz without a key", "200/503 with status only, no key or URLs",
         sorted(body), tc="C10-D04")
    assert "test-internal-key" not in text and "http" not in text
