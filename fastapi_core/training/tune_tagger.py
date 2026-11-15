"""Hyperparameter search for the Bi-LSTM-CRF tagger.

    python -m training.tune_tagger

Each configuration is trained on synthetic data (+ team-written examples) and
scored on the development set (data/test/provisional_claude.md, plus the
synthetic dev set as a tie-breaker). The best one is saved as the next model
version and promoted only if its entity F1 is not lower than the current
version's on the fixed test set (same rule as retrain.py). The held-out set
(data/test/holdout_claude.md) is scored once for the chosen model, never used
to choose.
"""

import itertools
import json
import time
from dataclasses import asdict, replace
from datetime import UTC, datetime

from app.algorithms.sequence_tagger import SequenceTagger, TaggerConfig, save_model

from .data import DATA_DIR, Example, load_markup_file
from .evaluation import evaluate, format_report
from .registry import MODELS_DIR, PROVISIONAL_TEST, current_version, load_team_examples, load_test_set, next_version, set_current
from .retrain import regex_predictor
from .synthetic import generate
from .train_lib import predictor, train_tagger
from app.nlp.tokens import parse_markup

HOLDOUT = DATA_DIR / "test" / "holdout_claude.md"

GRID = {
    "train_size": [2000, 5000],
    "hidden": [128, 256],
    "dropout": [0.3, 0.5],
    "epochs": [12, 20],
}


def as_examples(rows: list[dict]) -> list[Example]:
    return [Example(*parse_markup(row["markup"]), row["lang"], "synthetic") for row in rows]


def entity_f1(examples: list[Example], tagger: SequenceTagger) -> float:
    return evaluate(examples, predictor(tagger))["overall"]["entity"]["micro"]["f1"]


def main() -> None:
    dev_real = load_markup_file(PROVISIONAL_TEST)
    team = load_team_examples()
    synthetic_dev = as_examples(generate(300, 99))
    data_cache: dict[int, list[Example]] = {}
    results = []

    for train_size, hidden, dropout, epochs in itertools.product(*GRID.values()):
        if train_size not in data_cache:
            data_cache[train_size] = as_examples(generate(train_size, 13))
        config = replace(TaggerConfig(), hidden=hidden, dropout=dropout)
        started = time.perf_counter()
        tagger, history = train_tagger(
            data_cache[train_size] + team, synthetic_dev, config=config, epochs=epochs, log=lambda _: None
        )
        score = (entity_f1(dev_real, tagger), entity_f1(synthetic_dev, tagger))
        results.append({"train_size": train_size, "hidden": hidden, "dropout": dropout, "epochs": epochs,
                        "dev_f1": score[0], "synthetic_dev_f1": score[1], "tagger": tagger, "history": history})
        print(f"size {train_size:>5} hidden {hidden:>3} dropout {dropout} epochs {epochs:>2}: "
              f"dev F1 {score[0]:.4f}  synthetic dev {score[1]:.4f}  ({time.perf_counter() - started:.0f}s)", flush=True)

    best = max(results, key=lambda r: (r["dev_f1"], r["synthetic_dev_f1"], -r["train_size"], -r["hidden"]))
    tagger = best["tagger"]
    print(f"\nBest on dev: size {best['train_size']} hidden {best['hidden']} dropout {best['dropout']} "
          f"epochs {best['epochs']} (dev F1 {best['dev_f1']:.4f})")

    test, test_name = load_test_set()
    new_test = evaluate(test, predictor(tagger))
    current = current_version()
    current_f1 = entity_f1(test, SequenceTagger.from_directory(MODELS_DIR / current)) if current else None
    new_f1 = new_test["overall"]["entity"]["micro"]["f1"]

    holdout = load_markup_file(HOLDOUT)
    holdout_result = evaluate(holdout, predictor(tagger))
    print(format_report(f"Chosen model on held-out ({HOLDOUT.name}, scored once)", holdout_result))
    print(format_report("Regex baseline on held-out", evaluate(holdout, regex_predictor)))

    version = next_version()
    promote = current_f1 is None or new_f1 >= current_f1
    save_model(MODELS_DIR / version, tagger.model, tagger.vocab, {"version": version})
    metrics = {
        "version": version,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "search": [{k: v for k, v in r.items() if k not in ("tagger", "history")} for r in results],
        "chosen": {k: v for k, v in best.items() if k not in ("tagger", "history")},
        "config": asdict(tagger.model.config),
        "history": best["history"],
        "test": new_test,
        "test_set": test_name,
        "holdout": holdout_result,
        "compared_with": {"version": current, "entity_f1": current_f1},
        "promoted": promote,
    }
    (MODELS_DIR / version / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    if promote:
        set_current(version)
    print(f"\n{version} saved; {'promoted' if promote else 'NOT promoted'} "
          f"(entity F1 on {test_name} {new_f1:.4f} vs {current} {current_f1})")


if __name__ == "__main__":
    main()
