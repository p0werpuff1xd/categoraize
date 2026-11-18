"""Evaluate one system on one split.

    python -m eval.run_eval --split dev --system B1

Writes eval/results/<system>_<split>.json and prints a markdown table. Logs
contain only ids and labels, never email text. Run the test split once per
final evaluation; tune on dev only.
"""

import argparse
import json
import random
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from .loaders import load_categories, load_split
from .metrics import METRIC_NAMES, confusion_matrix, report
from .systems import SYSTEMS, Context, describe, predict

RESULTS_DIR = Path(__file__).resolve().parent / "results"
TABLE_METRICS = (
    "category_macro_f1", "category_accuracy", "priority_exact", "priority_within1", "priority_qwk", "priority_mae",
    "register_accuracy", "register_macro_f1", "task_precision", "task_recall", "task_f1", "date_precision",
    "date_recall", "date_f1", "span_micro_f1", "date_resolution_accuracy", "date_resolution_on_gold_spans",
    "conflict_accuracy",
)


def evaluate(system: str, split: str, context: Context | None = None) -> dict:
    random.seed(0)
    np.random.seed(0)
    context = context or Context()
    records = load_split(split)
    context.warm(records)
    pairs = [(record, predict(system, record, context)) for record in records]
    slugs = [category.slug for category in load_categories()]
    return {
        "system": system,
        "split": split,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "config": describe(system, context),
        "label_provenance": "AI-authored labels, human_reviewed=false on every record",
        "results": report(pairs),
        "confusion_matrix": confusion_matrix(pairs, slugs),
        "per_email": [
            {
                "id": record.id,
                "language": record.language,
                "gold_category": record.gold_category,
                "pred_category": prediction.category,
                "gold_priority": record.gold_priority,
                "pred_priority": prediction.priority,
                "gold_register": record.gold_register,
                "pred_register": prediction.register,
                "gold_conflict": record.gold_calendar_conflict,
                "pred_conflict": prediction.conflict,
                "span_errors": _span_errors(record, prediction),
                "priority_why": prediction.priority_why,
            }
            for record, prediction in pairs
        ],
    }


def _span_errors(record, prediction) -> int:
    gold = {(span.label, span.start, span.end) for span in record.gold_spans}
    predicted = {(span.label, span.start, span.end) for span in prediction.spans}
    return len(gold ^ predicted)


def markdown_table(result: dict, metrics: tuple[str, ...] = TABLE_METRICS) -> str:
    scopes = list(result["results"])
    header = "| metric | " + " | ".join(f"{scope} (n={result['results'][scope]['n']})" for scope in scopes) + " |"
    lines = [header, "|---|" + "---|" * len(scopes)]
    for name in metrics:
        cells = []
        for scope in scopes:
            cell = result["results"][scope]["metrics"][name]
            cells.append(format_cell(cell))
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def format_cell(cell: dict) -> str:
    if cell["value"] is None:
        return "n/a"
    if cell["low"] is None:
        return f"{cell['value']:.3f}"
    return f"{cell['value']:.3f} [{cell['low']:.3f}, {cell['high']:.3f}]"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--split", choices=("dev", "test"), required=True)
    parser.add_argument("--system", choices=(*SYSTEMS, "all"), required=True)
    args = parser.parse_args()
    systems = SYSTEMS if args.system == "all" else (args.system,)
    context = Context()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    for system in systems:
        result = evaluate(system, args.split, context)
        path = RESULTS_DIR / f"{system}_{args.split}.json"
        path.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        (RESULTS_DIR / f"{system}_{args.split}.md").write_text(
            f"# {system} on {args.split}\n\n{markdown_table(result)}\n", encoding="utf-8"
        )
        print(f"\n## {system} on {args.split}  ({path.name})\n")
        print(markdown_table(result))


if __name__ == "__main__":
    assert set(TABLE_METRICS) <= set(METRIC_NAMES)
    main()
