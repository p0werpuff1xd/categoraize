"""Train the Bi-LSTM-CRF TASK/DATE tagger on the dataset's train split (Phase 3).

    python -m eval.train_tagger

Train: train.jsonl bodies only. Early stopping: the epoch with the best dev
entity F1 is kept. The new version is saved under models/tagger/vN with a
model card and promoted (current.json) only if its dev span F1 is not lower
than the version currently in use. Test is not read here.

Embedding choice: the existing word + character-CNN + casing embedding. The
character CNN sees affixes (paki-, i-, mag-) and Taglish spellings that a
300-email word vocabulary never contains, and it keeps the model small
(about 1.4 MB) with no transformer at serving time. SBERT's subword tokenizer
would tie the tagger to a 470 MB model for each forward pass.
"""

import argparse
import json
import random
from datetime import UTC, datetime

import numpy as np
import torch

from app.algorithms.sequence_tagger import SequenceTagger, TaggerConfig, save_model
from app.nlp.tokens import CharSpan
from training.data import Example
from training.registry import MODELS_DIR, current_version, next_version, set_current
from training.train_lib import train_tagger

from .loaders import load_split
from .metrics import span_scores
from .systems import Context

SEED = 13
DATASET_COPIES = 5


def legacy_examples() -> list[Example]:
    """The v6 training mix: 5000 generated emails, team examples, LLM emails (minus their dev tenth) twice."""
    from training.registry import load_llm_examples, load_team_examples
    from training.synthetic import generate
    from training.tune_tagger import as_examples

    llm_train = [example for index, example in enumerate(load_llm_examples()) if index % 10]
    return as_examples(generate(5000, 13)) + load_team_examples() + llm_train * 2


def to_examples(split: str) -> list[Example]:
    return [Example(record.body, [CharSpan(span.label, span.start, span.end) for span in record.gold_spans],
                    record.language, record.id) for record in load_split(split)]


def dev_span_scores(tagger: SequenceTagger, context: Context) -> dict:
    """Span scores on dev overall and per language (no bootstrap; that is run_eval's job)."""
    dev = load_split("dev")
    pairs = [(record, _prediction(context.crf_spans(record, tagger))) for record in dev]
    scopes = {"overall": pairs, **{lang: [p for p in pairs if p[0].language == lang] for lang in ("en", "mixed", "tl")}}
    return {scope: {k: round(v, 4) for k, v in span_scores(subset).items()} for scope, subset in scopes.items()}


def _prediction(spans):
    from .metrics import Prediction

    return Prediction(category=None, priority=3, register="neutral", spans=spans, conflict=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--no-promote", action="store_true")
    parser.add_argument(
        "--with-legacy-data", action="store_true",
        help="also train on the older tagger data (generated synthetic, team, LLM-written); dataset train x5",
    )
    args = parser.parse_args()

    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.use_deterministic_algorithms(True)

    train, dev = to_examples("train"), to_examples("dev")
    data_note = "data/categoraize-dataset/data/train.jsonl (300, template-synthetic, bodies only)"
    if args.with_legacy_data:
        legacy = legacy_examples()
        data_note = (f"{data_note} x{DATASET_COPIES} plus {len(legacy)} older tagger examples "
                     "(generated synthetic, team-written, LLM-written; v6 recipe; no real user mail)")
        train = train * DATASET_COPIES + legacy
    tagger, history = train_tagger(train, dev, config=TaggerConfig(), epochs=args.epochs, seed=SEED)

    context = Context.__new__(Context)  # spans only: no SBERT needed
    version = next_version()
    tagger.version = version
    new_scores = dev_span_scores(tagger, context)

    previous = current_version()
    previous_scores = None
    if previous:
        previous_scores = dev_span_scores(SequenceTagger.from_directory(MODELS_DIR / previous), context)

    promote = not args.no_promote and (
        previous_scores is None or new_scores["overall"]["span_micro_f1"] >= previous_scores["overall"]["span_micro_f1"]
    )
    directory = MODELS_DIR / version
    save_model(directory, tagger.model, tagger.vocab, {"version": version})
    metrics = {
        "version": version,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "data": {"train": data_note,
                 "early_stopping": "dev.jsonl (30, hand-written), best epoch by entity F1"},
        "seed": SEED,
        "epochs": args.epochs,
        "config": TaggerConfig().__dict__,
        "history": history,
        "best_epoch": max(history, key=lambda row: row["dev_entity_f1"])["epoch"],
        "dev": new_scores,
        "compared_with": {"version": previous, "dev": previous_scores},
        "promoted": promote,
        "test": None,
    }
    (directory / "metrics.json").write_text(json.dumps(metrics, indent=1) + "\n", encoding="utf-8")
    write_model_card(directory, metrics)
    if promote:
        set_current(version)
    print(json.dumps({k: metrics[k] for k in ("version", "best_epoch", "dev", "compared_with", "promoted")}, indent=1))


def write_model_card(directory, metrics: dict) -> None:
    def row(scope: str, scores: dict | None) -> str:
        if not scores:
            return f"| {scope} | n/a | n/a | n/a |"
        s = scores[scope]
        return f"| {scope} | {s['task_f1']:.3f} | {s['date_f1']:.3f} | {s['span_micro_f1']:.3f} |"

    previous = metrics["compared_with"]
    test = metrics.get("test")
    lines = [
        f"# Tagger {metrics['version']} model card",
        "",
        "Bi-LSTM-CRF that tags TASK and DATE spans (BIO) in email bodies; DATE spans are resolved",
        "deterministically by `app/nlp/date_codes.py`.",
        "",
        "## Data",
        "",
        f"- Train: {metrics['data']['train']}. Fictional; no real user mail (Google Limited Use).",
        f"- Early stopping: {metrics['data']['early_stopping']}.",
        "- Labels are AI-authored (`human_reviewed=false`), pending second-labeler kappa and native-speaker review.",
        "- Train is template-synthetic, so dev/test scores overstate performance on real mail.",
        "",
        "## Training",
        "",
        f"- Seed {metrics['seed']}, {metrics['epochs']} epochs, best epoch {metrics['best_epoch']}, "
        f"trained {metrics['trained_at']}.",
        f"- Architecture: word embedding + character CNN + casing feature, BiLSTM, CRF. Config: `{metrics['config']}`.",
        "- Tokenizer keeps Filipino hyphenated forms (i-submit, paki-send, mag-Friday) as one token; a leading",
        "  `mag-` (DATE) or `pa-` (TASK) is left out of the span when decoding, as in the labeling guideline.",
        "",
        "## Dev span F1 (exact offsets)",
        "",
        "| scope | TASK F1 | DATE F1 | micro F1 |",
        "|---|---|---|---|",
        *(row(scope, metrics["dev"]) for scope in ("overall", "en", "mixed", "tl")),
        "",
        f"Previous version {previous['version']} on the same dev set:",
        "",
        "| scope | TASK F1 | DATE F1 | micro F1 |",
        "|---|---|---|---|",
        *(row(scope, previous["dev"]) for scope in ("overall", "en", "mixed", "tl")),
        "",
        f"Promoted to current: **{'yes' if metrics['promoted'] else 'no'}** "
        "(rule: promote only if dev micro F1 does not drop).",
        "",
        "## Test (run once, see eval/RESULTS.md)",
        "",
        "Not yet run." if not test else "\n".join([
            "| scope | TASK F1 | DATE F1 | micro F1 |", "|---|---|---|---|",
            *(row(scope, test) for scope in ("overall", "en", "mixed", "tl"))]),
        "",
        "## Review flags",
        "",
        "- The Filipino/Taglish date wordlist in `app/nlp/date_codes.py` (bukas, mamaya, ngayon, Lunes..Linggo,",
        "  alas-dos ng hapon, Disyembre 5, katapusan ng araw, ...) needs native-speaker review.",
        "",
    ]
    (directory / "MODEL_CARD.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
