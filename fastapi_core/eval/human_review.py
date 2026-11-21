"""Team review of the test labels (second labeler kappa and native-speaker review).

    python -m eval.human_review

Reads data/categoraize-dataset/review/team_review_2026-11-19/*.csv and writes
eval/results/human_review.json, which make_report.py adds to RESULTS.md.
Agreement is between the dataset's gold labels and the team's labels; the
gold labels themselves are not changed.
"""

import csv
import json
from collections import Counter
from pathlib import Path

import numpy as np
from sklearn.metrics import cohen_kappa_score

from .loaders import DATASET_DIR, LANGUAGES, load_split
from .metrics import BOOTSTRAP_SAMPLES, BOOTSTRAP_SEED

REVIEW_DIR = DATASET_DIR / "review" / "team_review_2026-11-19"
OUTPUT = Path(__file__).resolve().parent / "results" / "human_review.json"
CATEGORIES = ["work_tasks", "meetings", "school", "job_search", "finance_billing", "promotions", "alerts", "personal"]
REGISTERS = ["formal", "neutral", "casual"]
PROVENANCE = (
    "Second-labeler labels for the 100 test emails were filled by three team members (KIM, AD, LJ, about a "
    "third each). Per the project owner (2026-11-19), each labeled their own packet from a blank sheet "
    "without seeing the AI-drafted labels. Earlier AI-drafted versions of these sheets were not used."
)


def _rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _scores(pairs: list[tuple]) -> dict:
    gold_c, team_c, gold_p, team_p, gold_r, team_r = zip(*pairs, strict=True)
    return {
        "category_kappa": cohen_kappa_score(gold_c, team_c, labels=CATEGORIES),
        "category_agreement": float(np.mean([a == b for a, b in zip(gold_c, team_c, strict=True)])),
        "priority_weighted_kappa": cohen_kappa_score(gold_p, team_p, labels=[1, 2, 3, 4, 5], weights="quadratic"),
        "priority_exact": float(np.mean([a == b for a, b in zip(gold_p, team_p, strict=True)])),
        "priority_within1": float(np.mean([abs(a - b) <= 1 for a, b in zip(gold_p, team_p, strict=True)])),
        "register_kappa": cohen_kappa_score(gold_r, team_r, labels=REGISTERS),
        "register_agreement": float(np.mean([a == b for a, b in zip(gold_r, team_r, strict=True)])),
    }


def _with_ci(pairs: list[tuple]) -> dict:
    point = _scores(pairs)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    draws = {name: [] for name in point}
    for _ in range(BOOTSTRAP_SAMPLES):
        sample = [pairs[i] for i in rng.integers(0, len(pairs), len(pairs))]
        for name, value in _scores(sample).items():
            if not np.isnan(value):
                draws[name].append(value)
    return {name: {"value": round(float(value), 4),
                   "low": round(float(np.percentile(draws[name], 2.5)), 4),
                   "high": round(float(np.percentile(draws[name], 97.5)), 4)} for name, value in point.items()}


def main() -> None:
    gold = {record.id: record for record in load_split("test")}
    blind = [row for path in sorted(REVIEW_DIR.glob("*_1_blind.csv")) for row in _rows(path)]
    assert sorted(row["id"] for row in blind) == sorted(gold), "blind sheets must cover the test set exactly once"
    pairs_by_language: dict[str, list[tuple]] = {"overall": []}
    for row in blind:
        record = gold[row["id"]]
        pair = (record.gold_category, row[next(k for k in row if k.startswith("category"))].strip(),
                record.gold_priority, int(row["priority (1-5)"]), record.gold_register,
                row["register (formal|neutral|casual)"].strip())
        pairs_by_language["overall"].append(pair)
        pairs_by_language.setdefault(record.language, []).append(pair)

    native = [row for path in sorted(REVIEW_DIR.glob("*_2_native.csv")) for row in _rows(path)]
    ratings = [(row["id"].split("-")[1], int(row["sounds_natural (1-5)"])) for row in native]
    body = {
        "provenance": PROVENANCE,
        "second_labeler": {
            "reviewers": dict(Counter(row["reviewer_initials"] for row in blind)),
            "scopes": {scope: {"n": len(pairs), "metrics": _with_ci(pairs)}
                       for scope, pairs in pairs_by_language.items() if scope == "overall" or scope in LANGUAGES},
            "confusions": [{"gold": g, "team": t, "count": n} for (g, t), n in Counter(
                (p[0], p[1]) for p in pairs_by_language["overall"] if p[0] != p[1]).most_common()],
        },
        "native_review": {
            "rows": len(native),
            "reviewers": dict(Counter(row["reviewer_initials"] for row in native)),
            "mean_naturalness": round(float(np.mean([r for _, r in ratings])), 2),
            "mean_naturalness_by_language": {lang: round(float(np.mean([r for l, r in ratings if l == lang])), 2)
                                             for lang in sorted({l for l, _ in ratings})},
            "rated_3_or_lower": sum(r <= 3 for _, r in ratings),
            "label_not_ok_ids": sorted(row["id"] for row in native if row["label_ok (y/n)"].strip().lower() == "n"),
        },
    }
    OUTPUT.write_text(json.dumps(body, indent=1) + "\n", encoding="utf-8")
    overall = body["second_labeler"]["scopes"]["overall"]["metrics"]
    print(json.dumps({k: overall[k]["value"] for k in overall}, indent=1))
    print("native:", {k: body["native_review"][k] for k in ("rows", "mean_naturalness", "rated_3_or_lower")},
          "label not ok:", len(body["native_review"]["label_not_ok_ids"]))


if __name__ == "__main__":
    main()
