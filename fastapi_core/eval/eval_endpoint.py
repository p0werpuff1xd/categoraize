"""Evaluate the production /api/v1/classify endpoint on the labelled dataset.

eval.run_eval scores its own re-implementation of the pipeline (B1-B4), which
does not include what the endpoint does after tagging (date resolution in
app.nlp.extractor, span filtering, bulk-mail rules, the learned priority with
its guardrails). This scores the endpoint itself, as the web app calls it, so
the reported numbers describe what users get.

    python -m eval.eval_endpoint --split dev [--repeat 2] [--out eval/results/endpoint_dev.json]

Synthetic and team-written data only (no real mail).
"""

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("CATEGORAIZE_INTERNAL_KEY", "eval-key")
os.environ["CATEGORAIZE_RATE_LIMIT_PER_MINUTE"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.embeddings import model_manager  # noqa: E402

from .loaders import load_categories, load_split  # noqa: E402
from .metrics import PredictedSpan, Prediction, report  # noqa: E402

AUTH = {"X-Internal-Key": os.environ["CATEGORAIZE_INTERNAL_KEY"]}
DEFAULT_DUE = "17:00"


def _resolution(value: str | None, gold_example: str | None) -> str | None:
    """The endpoint returns a datetime; date-only gold compares by day when the
    endpoint used the default due time."""
    if value is None:
        return None
    if gold_example is not None and len(gold_example) == 10 and value[11:16] == DEFAULT_DUE:
        return value[:10]
    return value


def classify(client: TestClient, record, categories) -> dict:
    payload = {
        "email_id": record.id,
        "subject": record.subject,
        "body": record.body,
        "received_at": record.received_at.isoformat(),
        "now": record.received_at.isoformat(),
        "timezone": "Asia/Manila",
        "sender": {"email": "", "role": record.sender_role or None, "is_vip": record.is_vip},
        "categories": [{"id": c.slug, "name": c.name, "description": c.description} for c in categories],
        "calendar_busy": [{"start": p.start.isoformat(), "end": p.end.isoformat()} for p in record.calendar_busy]
        or None,
    }
    response = client.post("/api/v1/classify", json=payload, headers=AUTH)
    response.raise_for_status()
    return response.json()


def to_prediction(record, result: dict) -> Prediction:
    gold_dates = [span for span in record.gold_spans if span.label == "DATE"]
    gold_by_offset = {(span.start, span.end): span.resolved for span in gold_dates}
    spans = []  # gold offsets are body-relative, as are the endpoint's body spans
    for span in result["spans"]:
        if span["source"] != "body":
            continue
        start, end = span["start"], span["end"]
        ambiguous = bool(span.get("ambiguous"))
        # The guideline gives vague dates no value; the app shows its guess only
        # for review and never counts it, so an ambiguous guess scores as None.
        resolved = None if ambiguous else _resolution(span.get("resolved"), gold_by_offset.get((start, end)))
        spans.append(PredictedSpan(span["label"], start, end, resolved, ambiguous))
    learned = result.get("learned_priority") or {}
    category = (result.get("category") or {}).get("id")
    return Prediction(
        category=category,
        priority=learned.get("level") or result["priority"]["level"],
        register=(result.get("sender_register") or {}).get("value", "neutral"),
        spans=spans,
        conflict=bool(result["priority"]["factors"].get("calendar")),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", default="dev")
    parser.add_argument("--repeat", type=int, default=1, help="run twice to check determinism")
    parser.add_argument("--out")
    args = parser.parse_args()

    model_manager.load()
    categories = load_categories()
    records = load_split(args.split)
    with TestClient(app) as client:
        runs = [[classify(client, record, categories) for record in records] for _ in range(args.repeat)]
    pairs = [(record, to_prediction(record, result)) for record, result in zip(records, runs[0], strict=True)]
    summary = report(pairs)
    if args.repeat > 1:
        differing = sum(
            1
            for index in range(len(records))
            if any(
                json.dumps({k: v for k, v in run[index].items() if k not in {"timings_ms", "embedding"}}, sort_keys=True)
                != json.dumps({k: v for k, v in runs[0][index].items() if k not in {"timings_ms", "embedding"}}, sort_keys=True)
                for run in runs[1:]
            )
        )
        summary["determinism"] = {"runs": args.repeat, "emails_with_different_output": differing}
    keys = ("category_accuracy", "category_macro_f1", "priority_exact", "priority_within_1", "priority_qwk",
            "task_precision", "task_recall", "task_f1", "date_precision", "date_recall", "date_f1",
            "date_resolution_accuracy")
    overall = summary["overall"]["metrics"]
    print(f"split={args.split} n={summary['overall']['n']}")
    for key in keys:
        if key in overall:
            cell = overall[key]
            print(f"  {key:26} {cell['value']:.3f}" if isinstance(cell, dict) else f"  {key:26} {cell}")
    if "determinism" in summary:
        print("  determinism", summary["determinism"])
    if args.out:
        Path(args.out).write_text(json.dumps(summary, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
