"""Score the current tagger and the regex baseline on the test set.

    python -m training.evaluate
    python -m training.evaluate --version v1 --file data/test/hand_labeled.md
"""

import argparse
from pathlib import Path

from app.algorithms.sequence_tagger import SequenceTagger

from .data import load_markup_file
from .evaluation import evaluate, format_report
from .registry import MODELS_DIR, current_version, load_test_set
from .retrain import regex_predictor
from .train_lib import predictor


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--version")
    parser.add_argument("--file", type=Path)
    args = parser.parse_args()

    version = args.version or current_version()
    if version is None:
        raise SystemExit("No trained tagger yet. Run: python -m training.retrain")
    if args.file:
        examples, name = load_markup_file(args.file.resolve()), args.file.name
    else:
        examples, name = load_test_set()
    tagger = SequenceTagger.from_directory(MODELS_DIR / version)
    print(f"Test set: {name} ({len(examples)} emails)")
    print(format_report(f"Bi-LSTM-CRF {version}", evaluate(examples, predictor(tagger))))
    print(format_report("Regex baseline", evaluate(examples, regex_predictor)))


if __name__ == "__main__":
    main()
