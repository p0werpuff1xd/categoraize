"""System (integration) tests against a deployed CategorAIze stack (Prompt B).

Not part of the unit run: `pytest system_tests` from fastapi_core/.
Environment:
  SYSTEM_NLP_URL      deployed NLP service (default: production Cloud Run)
  SYSTEM_WEB_URL      deployed web app (default: production Cloud Run)
  SYSTEM_NLP_KEY      the real X-Internal-Key (the runner reads it from the
                      secrets folder; it is never printed or written to a report)
The in-process app (this checkout) is the reference the deployed service is
compared with.
"""
from __future__ import annotations

import json
import os
import time

import httpx
import pytest

os.environ.setdefault("CATEGORAIZE_INTERNAL_KEY", "local-reference-key")
os.environ["CATEGORAIZE_RATE_LIMIT_PER_MINUTE"] = "0"

NLP_URL = os.environ.get("SYSTEM_NLP_URL", "https://categoraize-nlp-35rdktlybq-as.a.run.app").rstrip("/")
WEB_URL = os.environ.get("SYSTEM_WEB_URL", "https://categoraize-35rdktlybq-eu.a.run.app").rstrip("/")
NLP_KEY = os.environ.get("SYSTEM_NLP_KEY", "")
LOCAL_AUTH = {"X-Internal-Key": os.environ["CATEGORAIZE_INTERNAL_KEY"]}


def _text(value) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)


@pytest.fixture
def case(record_property):
    """Record input/expected/actual (and optional evidence) in the JUnit XML."""

    def record(input, expected, actual, tc=None, evidence=None):
        if tc:
            record_property("tc_id", tc)
        record_property("input", _text(input)[:300])
        record_property("expected", _text(expected)[:300])
        record_property("actual", _text(actual)[:300])
        if evidence:
            record_property("evidence", _text(evidence)[:300])
        return actual

    return record


@pytest.fixture(scope="session")
def remote():
    if not NLP_KEY:
        pytest.skip("BLOCKED: SYSTEM_NLP_KEY is not set (the runner reads it from the secrets folder)")
    with httpx.Client(base_url=NLP_URL, headers={"X-Internal-Key": NLP_KEY}, timeout=60) as client:
        # Wake the service so the first measured request is not a cold start.
        client.get("/openapi.json")
        yield client


@pytest.fixture(scope="session")
def anonymous():
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        yield client


@pytest.fixture(scope="session")
def local():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.embeddings import model_manager

    if not model_manager.ready:
        model_manager.load()
    with TestClient(app) as client:
        yield client


def timed_post(client, path: str, payload: dict, headers: dict | None = None):
    start = time.perf_counter()
    response = client.post(path, json=payload, headers=headers)
    return response, (time.perf_counter() - start) * 1000
