"""Token-level and entity-level precision/recall/F1 for TASK and DATE.

Entity level is exact match: same label, same first and last token. Both the
Bi-LSTM-CRF and the regex baseline are scored on the same tokens, so their
numbers are directly comparable.
"""

from collections.abc import Callable
from dataclasses import dataclass, field

from app.nlp.tokens import LABELS, CharSpan, bio_to_spans, spans_to_bio, tokenize

from .data import Example

# A predictor maps the full text to character spans.
Predictor = Callable[[str], list[CharSpan]]


@dataclass
class Counts:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    def add(self, other: "Counts") -> None:
        self.tp += other.tp
        self.fp += other.fp
        self.fn += other.fn

    def scores(self) -> dict[str, float]:
        precision = self.tp / (self.tp + self.fp) if self.tp + self.fp else 0.0
        recall = self.tp / (self.tp + self.fn) if self.tp + self.fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
                "support": self.tp + self.fn}


@dataclass
class Report:
    token: dict[str, Counts] = field(default_factory=lambda: {label: Counts() for label in LABELS})
    entity: dict[str, Counts] = field(default_factory=lambda: {label: Counts() for label in LABELS})
    examples: int = 0

    def summary(self) -> dict:
        def block(counts: dict[str, Counts]) -> dict:
            total = Counts()
            for value in counts.values():
                total.add(value)
            return {**{label: counts[label].scores() for label in LABELS}, "micro": total.scores()}

        return {"examples": self.examples, "token": block(self.token), "entity": block(self.entity)}


def evaluate(examples: list[Example], predict: Predictor) -> dict:
    """Overall scores plus one block per language."""
    overall = Report()
    by_lang: dict[str, Report] = {}
    for example in examples:
        tokens = tokenize(example.text)
        gold_tags = spans_to_bio(tokens, example.spans)
        predicted_tags = spans_to_bio(tokens, predict(example.text))
        for report in (overall, by_lang.setdefault(example.lang, Report())):
            _score(report, tokens, gold_tags, predicted_tags)
    return {"overall": overall.summary(), "by_language": {lang: report.summary() for lang, report in sorted(by_lang.items())}}


def _score(report: Report, tokens, gold_tags: list[str], predicted_tags: list[str]) -> None:
    report.examples += 1
    for gold, predicted in zip(gold_tags, predicted_tags, strict=True):
        gold_label = gold[2:] if gold != "O" else None
        predicted_label = predicted[2:] if predicted != "O" else None
        for label in LABELS:
            hit_gold, hit_predicted = gold_label == label, predicted_label == label
            report.token[label].tp += hit_gold and hit_predicted
            report.token[label].fp += hit_predicted and not hit_gold
            report.token[label].fn += hit_gold and not hit_predicted
    gold_spans = {(span.label, span.start, span.end) for span in bio_to_spans(tokens, gold_tags)}
    predicted_spans = {(span.label, span.start, span.end) for span in bio_to_spans(tokens, predicted_tags)}
    for label in LABELS:
        gold = {span for span in gold_spans if span[0] == label}
        predicted = {span for span in predicted_spans if span[0] == label}
        report.entity[label].tp += len(gold & predicted)
        report.entity[label].fp += len(predicted - gold)
        report.entity[label].fn += len(gold - predicted)


def format_report(name: str, result: dict) -> str:
    lines = [f"{name} ({result['overall']['examples']} examples)"]
    for scope, block in [("all", result["overall"]), *result["by_language"].items()]:
        entity, token = block["entity"], block["token"]
        lines.append(
            f"  {scope:<8} entity F1 {entity['micro']['f1']:.3f} "
            f"(TASK {entity['TASK']['f1']:.3f} P {entity['TASK']['precision']:.3f} R {entity['TASK']['recall']:.3f}; "
            f"DATE {entity['DATE']['f1']:.3f} P {entity['DATE']['precision']:.3f} R {entity['DATE']['recall']:.3f})  "
            f"token F1 {token['micro']['f1']:.3f}"
        )
    return "\n".join(lines)
