"""Train a new tagger version and promote it only if it is not worse.

    python -m training.retrain              # train v(N+1), promote if entity F1 does not drop
    python -m training.retrain --force      # promote even if it is worse (first run, experiments)

Training data: synthetic emails (data/synthetic) + team-written examples
(data/team) + hand-corrected examples (data/corrected). NEVER real users'
mailbox data or their in-app corrections: Google's API Limited Use rules
forbid training generalized models on Gmail data.

The new and current models are both scored on the same fixed test set
(data/test/hand_labeled.md, or the provisional set until that has emails), so
the comparison stays fair even if the test file changed since the last run.
The service picks up a promoted version on its next restart; it never swaps
weights while serving.
"""

import argparse
import json
from datetime import UTC, datetime

from app.algorithms.sequence_tagger import SequenceTagger, save_model
from app.nlp.regex_tagger import tag as regex_tag
from app.nlp.tokens import CharSpan

from .data import DATA_DIR, load_jsonl
from .evaluation import evaluate, format_report
from .registry import (
    MODELS_DIR,
    current_version,
    load_llm_examples,
    load_team_examples,
    load_test_set,
    next_version,
    set_current,
)
from .synthetic import generate, write_jsonl
from .train_lib import predictor, train_tagger


def regex_predictor(text: str) -> list[CharSpan]:
    return [CharSpan(span.label, span.start, span.end) for span in regex_tag(text)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--force", action="store_true", help="promote even if entity F1 drops")
    args = parser.parse_args()

    train_path, dev_path = DATA_DIR / "synthetic" / "train.jsonl", DATA_DIR / "synthetic" / "dev.jsonl"
    if not train_path.exists() or not dev_path.exists():
        write_jsonl(train_path, generate(2000, 13))
        write_jsonl(dev_path, generate(300, 99))
    synthetic_train, synthetic_dev = load_jsonl(train_path), load_jsonl(dev_path)
    team = load_team_examples()
    llm = load_llm_examples()
    test, test_name = load_test_set()
    print(f"train: {len(synthetic_train)} synthetic + {len(team)} team-written/corrected + {len(llm)} LLM-written; "
          f"dev: {len(synthetic_dev)} synthetic; test: {len(test)} from {test_name}")

    tagger, history = train_tagger(synthetic_train + team + llm, synthetic_dev, epochs=args.epochs)

    new_test = evaluate(test, predictor(tagger))
    regex_test = evaluate(test, regex_predictor)
    new_dev = evaluate(synthetic_dev, predictor(tagger))
    print(format_report("Bi-LSTM-CRF on test", new_test))
    print(format_report("Regex baseline on test", regex_test))
    print(format_report("Bi-LSTM-CRF on synthetic dev (inflated: same generator as training)", new_dev))

    current = current_version()
    current_f1 = None
    if current:
        current_tagger = SequenceTagger.from_directory(MODELS_DIR / current)
        current_f1 = evaluate(test, predictor(current_tagger))["overall"]["entity"]["micro"]["f1"]
    new_f1 = new_test["overall"]["entity"]["micro"]["f1"]

    version = next_version()
    promote = args.force or current_f1 is None or new_f1 >= current_f1
    metrics = {
        "version": version,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data": {"synthetic_train": len(synthetic_train), "team": len(team), "synthetic_dev": len(synthetic_dev),
                 "test": len(test), "test_set": test_name},
        "history": history,
        "test": new_test,
        "regex_baseline_test": regex_test,
        "synthetic_dev": new_dev,
        "compared_with": {"version": current, "entity_f1": current_f1},
        "promoted": promote,
    }
    save_model(MODELS_DIR / version, tagger.model, tagger.vocab, {"version": version})
    (MODELS_DIR / version / "metrics.json").write_text(json.dumps(metrics, indent=1), encoding="utf-8")

    if promote:
        set_current(version)
        print(f"\n{version} saved and promoted (entity F1 {new_f1:.3f}"
              + (f" vs {current} {current_f1:.3f})." if current_f1 is not None else ")."))
        print("Restart the NLP service to load it.")
    else:
        print(f"\n{version} saved but NOT promoted: entity F1 {new_f1:.3f} < {current} {current_f1:.3f}.")


if __name__ == "__main__":
    main()
