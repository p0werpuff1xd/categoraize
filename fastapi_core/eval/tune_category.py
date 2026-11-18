"""Grid-search the category parameters (B2 -> B3) on dev only.

    python -m eval.tune_category

Parameters: zero-shot threshold, keyword boost, role boost and the Rocchio
beta (weight of the mean train-email embedding next to the description;
alpha stays 1). Selection: dev macro-F1, then dev accuracy, then the
simplest setting (smaller boosts and beta, higher threshold). Writes
config/tuned.json. The test split is never read.
"""

import itertools
import json
from datetime import UTC, datetime

from .loaders import load_split
from .metrics import macro_f1
from .systems import TUNED_PATH, CategoryParams, Context

THRESHOLDS = (0.0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35)
KEYWORD_WEIGHTS = (0.0, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5)
ROLE_WEIGHTS = (0.0, 0.02, 0.05, 0.1, 0.2)
ROCCHIO_BETAS = (0.0, 0.5, 1.0, 2.0, 4.0)


def main() -> None:
    context = Context()
    dev = load_split("dev")
    context.warm(dev)
    gold = [record.gold_category for record in dev]
    trials = []
    for beta, keyword_weight, role_weight in itertools.product(ROCCHIO_BETAS, KEYWORD_WEIGHTS, ROLE_WEIGHTS):
        centroids = context.centroids(1.0, beta)
        base = CategoryParams(threshold=-1.0, keyword_weight=keyword_weight, role_weight=role_weight,
                              rocchio_alpha=1.0, rocchio_beta=beta)
        scored = [context.sbert_category(record, base, centroids)[1] for record in dev]
        for threshold in THRESHOLDS:
            predicted = []
            for scores in scored:
                best = max(scores, key=scores.__getitem__)
                predicted.append(best if scores[best] >= threshold else None)
            trials.append({
                "params": CategoryParams(threshold, keyword_weight, role_weight, 1.0, beta).__dict__,
                "dev_macro_f1": round(macro_f1(gold, predicted), 4),
                "dev_accuracy": round(sum(g == p for g, p in zip(gold, predicted, strict=True)) / len(gold), 4),
            })

    def key(trial: dict) -> tuple:
        params = trial["params"]
        return (-trial["dev_macro_f1"], -trial["dev_accuracy"],
                params["keyword_weight"] + params["role_weight"], params["rocchio_beta"], -params["threshold"])

    trials.sort(key=key)
    best = trials[0]
    zero_shot = next(trial for trial in trials if trial["params"] == CategoryParams().__dict__)
    body = {
        "_note": ("Tuned on dev only (n=30). One dev email is 0.033 accuracy, so neighbouring settings are "
                  "statistically indistinguishable; the chosen beta and threshold sit at the grid edge. The grid "
                  "was widened once (keyword 0.2->0.5, role 0.1->0.2) and then frozen to avoid fitting dev noise."),
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "category": best["params"],
        "dev_scores": {"chosen": {k: best[k] for k in ("dev_macro_f1", "dev_accuracy")},
                       "zero_shot_B2": {k: zero_shot[k] for k in ("dev_macro_f1", "dev_accuracy")}},
        "grid": {"thresholds": THRESHOLDS, "keyword_weights": KEYWORD_WEIGHTS, "role_weights": ROLE_WEIGHTS,
                 "rocchio_alpha": 1.0, "rocchio_betas": ROCCHIO_BETAS, "trials": len(trials)},
        "top5": trials[:5],
    }
    TUNED_PATH.write_text(json.dumps(body, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: body[k] for k in ("category", "dev_scores")}, indent=1))
    print("top 5:", *[(t["params"], t["dev_macro_f1"], t["dev_accuracy"]) for t in trials[:5]], sep="\n")


if __name__ == "__main__":
    main()
