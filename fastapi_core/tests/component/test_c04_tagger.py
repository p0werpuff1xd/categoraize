"""C4 Bi-LSTM-CRF TASK/DATE tagger and BIO <-> character-offset conversion."""

import json
from pathlib import Path

import pytest
import torch

from app.nlp.tokens import CharSpan, bio_to_spans, spans_to_bio, tokenize
from app.services.tagger import tagger_manager
from eval.loaders import load_split
from eval.metrics import Prediction, span_scores
from training.data import Example
from training.train_lib import train_tagger

RESULTS = Path(__file__).resolve().parents[2] / "eval" / "results"


def _round_trip(text, spans):
    tokens = tokenize(text)
    return bio_to_spans(tokens, spans_to_bio(tokens, spans))


def _span(text, label, phrase):
    start = text.index(phrase)
    return CharSpan(label, start, start + len(phrase))


ROUND_TRIPS = [
    ("C4-01", "Please send the report tomorrow.", [("TASK", "send the report"), ("DATE", "tomorrow")]),
    ("C4-02", "Paki-send ang slides bukas ng 9 AM.", [("TASK", "Paki-send ang slides"), ("DATE", "bukas ng 9 AM")]),
    ("C4-03", "Submit the form Friday", [("TASK", "Submit the form"), ("DATE", "Friday")]),
    ("C4-04", "I-submit ang ulat bago mag-Biyernes.", [("TASK", "I-submit ang ulat"), ("DATE", "Biyernes")]),
    ("C4-05", "Thanks for the update, see you around.", []),
]


@pytest.mark.parametrize(("tc", "text", "spans"), [pytest.param(*row, id=f"{row[0]} {row[1][:30]}") for row in ROUND_TRIPS])
def test_bio_round_trip(case, tc, text, spans):
    gold = [_span(text, label, phrase) for label, phrase in spans]
    back = _round_trip(text, gold)
    case(text, [(s.label, text[s.start:s.end]) for s in gold], [(s.label, text[s.start:s.end]) for s in back])
    assert back == gold


def test_adjacent_same_label_spans_stay_separate(case):
    tokens = tokenize("send report email boss")
    tags = ["B-TASK", "I-TASK", "B-TASK", "I-TASK"]
    spans = [(s.label, s.start, s.end) for s in bio_to_spans(tokens, tags)]
    case("tags B-TASK I-TASK B-TASK I-TASK", "two TASK spans", spans, tc="C4-06")
    assert len(spans) == 2


def test_overlapping_input_spans_produce_no_overlap(case):
    text = "Please review the contract today"
    overlapping = [_span(text, "TASK", "review the contract"), _span(text, "DATE", "contract today")]
    back = _round_trip(text, overlapping)
    pairs = [(a, b) for a in back for b in back if a is not b and a.start < b.end and b.start < a.end]
    case("TASK 'review the contract' overlapping DATE 'contract today'", "decoded spans never overlap",
         [(s.label, text[s.start:s.end]) for s in back], tc="C4-07")
    assert pairs == []


def test_stray_inside_tag_starts_a_span(case):
    tokens = tokenize("send it now")
    spans = [(s.label, s.start, s.end) for s in bio_to_spans(tokens, ["I-TASK", "I-TASK", "O"])]
    case("tags I-TASK I-TASK O", "one TASK span 'send it'", spans, tc="C4-08")
    assert spans == [("TASK", 0, 7)]


def test_no_span_email_yields_no_spans(case):
    _, tag, _ = tagger_manager.active()
    text = "Thanks for the photos from the weekend, they look great."
    actual = [(s.label, s.text) for s in tag(text)]
    case(text, [], actual, tc="C4-09")
    assert actual == []


def test_tagging_is_deterministic(case):
    _, tag, version = tagger_manager.active()
    text = "Paki-review ang contract bukas ng 10 AM, then send it to legal by Friday."
    runs = [[(s.label, s.start, s.end) for s in tag(text)] for _ in range(3)]
    case(f"same text tagged 3 times (tagger {version})", "identical output", runs[0], tc="C4-10")
    assert runs[0] == runs[1] == runs[2]


def test_dev_span_f1_matches_the_recorded_evaluation(case):
    _, tag, version = tagger_manager.active()
    pairs = []
    for record in load_split("dev"):
        from eval.metrics import PredictedSpan

        spans = [PredictedSpan(s.label, s.start, s.end) for s in tag(record.body)]
        pairs.append((record, Prediction(None, 3, "neutral", spans, False)))
    f1 = round(span_scores(pairs)["span_micro_f1"], 4)
    recorded = json.loads((RESULTS / "B4_dev.json").read_text(encoding="utf-8"))
    expected = recorded["results"]["overall"]["metrics"]["span_micro_f1"]["value"]
    case(f"dev split (30 emails), tagger {version}", expected, f1, tc="C4-11")
    assert abs(f1 - expected) < 1e-3


def test_training_is_deterministic_with_a_fixed_seed(case):
    train = [Example(r.body, [CharSpan(s.label, s.start, s.end) for s in r.gold_spans], r.language, r.id)
             for r in load_split("train")[:24]]
    torch.use_deterministic_algorithms(True)
    states = []
    for _ in range(2):
        tagger, _ = train_tagger(train, train[:6], epochs=2, seed=13, log=lambda _: None)
        states.append({k: v.clone() for k, v in tagger.model.state_dict().items()})
    same = all(torch.equal(states[0][k], states[1][k]) for k in states[0])
    case("two 2-epoch trainings on 24 train emails, seed 13", "identical weights", same, tc="C4-12")
    assert same
