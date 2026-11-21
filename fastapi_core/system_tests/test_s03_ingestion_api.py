"""S3 (API half): 50 mixed-language emails through the deployed /classify.

Each email must get a category, a P1..P5 priority, TASK/DATE spans and a
language, within the latency budget, and the deployed answer must match this
checkout's in-process service (same model, same request). The 50 emails are the
first 17 en, 17 mixed and 16 tl records of the frozen test split, used here as
mail content only: nothing is tuned on them.
"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

import pytest
from conftest import LOCAL_AUTH, timed_post

from eval.loaders import load_categories

DATA = Path(__file__).resolve().parents[1] / "data" / "categoraize-dataset" / "data" / "test.jsonl"
CATEGORIES = [{"id": c.slug, "name": c.name, "description": c.description, "base_priority": 3}
              for c in load_categories()]
P95_BUDGET_MS = 2000


def _emails():
    rows = [json.loads(line) for line in DATA.read_text(encoding="utf-8").splitlines() if line.strip()]
    quota = {"en": 17, "mixed": 17, "tl": 16}
    picked = []
    for row in sorted(rows, key=lambda r: r["id"]):
        if quota.get(row["language"], 0) > 0:
            quota[row["language"]] -= 1
            picked.append(row)
    return picked


EMAILS = _emails()
LATENCIES: dict[str, float] = {}


def payload(row: dict) -> dict:
    return {
        "email_id": row["id"],
        "subject": row["subject"],
        "body": row["body"],
        "received_at": row["received_at"],
        "timezone": "Asia/Manila",
        "now": row["received_at"],
        "sender": {"email": "sender@example.invalid", "role": row["sender_role"], "is_vip": row["is_vip"]},
        "categories": CATEGORIES,
        "threshold": 0.35,
    }


def summary(body: dict) -> dict:
    return {
        "language": body["language"],
        "category": (body.get("category") or {}).get("id"),
        "top3": [(r["id"], round(r["similarity"], 2)) for r in body["ranked"][:3]],
        "priority": body["priority"]["level"],
        "spans": sorted((s["label"], s["text"]) for s in body["spans"]),
    }


@pytest.mark.parametrize("row", EMAILS, ids=[f"S3-{i + 1:02d} {r['id']}" for i, r in enumerate(EMAILS)])
def test_email_is_classified_like_the_reference(case, remote, local, row):
    response, ms = timed_post(remote, "/api/v1/classify", payload(row))
    LATENCIES[row["id"]] = ms
    assert response.status_code == 200, response.text[:200]
    deployed = summary(response.json())
    reference = summary(local.post("/api/v1/classify", json=payload(row), headers=LOCAL_AUTH).json())
    case(f"[{row['language']}] {row['subject']}", reference, {**deployed, "ms": round(ms)},
         evidence=f"POST {remote.base_url}/api/v1/classify {response.status_code} in {ms:.0f} ms")
    assert 1 <= deployed["priority"] <= 5
    assert deployed["language"] in {"en", "tl", "mixed", "unknown"}
    assert deployed["category"] == reference["category"]
    assert deployed["priority"] == reference["priority"]
    assert deployed["spans"] == reference["spans"]


def test_latency_p50_p95(case):
    if len(LATENCIES) < len(EMAILS):
        pytest.skip("BLOCKED: the per-email cases did not all run")
    values = sorted(LATENCIES.values())
    p50 = statistics.median(values)
    p95 = values[max(0, int(round(0.95 * len(values))) - 1)]
    case(f"{len(values)} sequential /classify calls", f"p95 <= {P95_BUDGET_MS} ms",
         {"p50_ms": round(p50), "p95_ms": round(p95), "max_ms": round(values[-1])}, tc="S3-51")
    assert p95 <= P95_BUDGET_MS
