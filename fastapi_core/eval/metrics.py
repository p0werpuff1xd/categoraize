"""Metrics with bootstrap confidence intervals, overall and per language.

The bootstrap resamples emails (the unit of the test set) with replacement,
1000 times with a fixed seed, and reports the 2.5th and 97.5th percentiles.
"""

import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

import numpy as np
from sklearn.metrics import cohen_kappa_score

from .loaders import LANGUAGES, Record

BOOTSTRAP_SAMPLES = 1000
BOOTSTRAP_SEED = 20261118
SPAN_LABELS = ("TASK", "DATE")
PRIORITIES = (1, 2, 3, 4, 5)


@dataclass(frozen=True)
class PredictedSpan:
    label: str
    start: int
    end: int
    resolved: str | None = None
    ambiguous: bool = False


@dataclass
class Prediction:
    category: str | None
    priority: int
    register: str
    spans: list[PredictedSpan]
    conflict: bool
    # The date normalizer applied to the gold DATE texts, in gold order; isolates
    # resolution quality from tagging quality.
    gold_date_resolutions: list[tuple[str | None, bool]] = field(default_factory=list)
    category_scores: dict[str, float] = field(default_factory=dict)
    priority_why: list[dict] = field(default_factory=list)


Pair = tuple[Record, Prediction]
METRIC_NAMES = (
    "category_accuracy",
    "category_macro_f1",
    "priority_exact",
    "priority_within1",
    "priority_qwk",
    "priority_mae",
    "register_accuracy",
    "register_macro_f1",
    "task_precision",
    "task_recall",
    "task_f1",
    "date_precision",
    "date_recall",
    "date_f1",
    "span_micro_f1",
    "date_resolution_accuracy",
    "date_resolution_on_gold_spans",
    "conflict_accuracy",
)


def compute(pairs: Sequence[Pair]) -> dict[str, float]:
    gold_categories = [record.gold_category for record, _ in pairs]
    predicted_categories = [prediction.category for _, prediction in pairs]
    gold_priority = [record.gold_priority for record, _ in pairs]
    predicted_priority = [prediction.priority for _, prediction in pairs]
    gold_register = [record.gold_register for record, _ in pairs]
    predicted_register = [prediction.register for _, prediction in pairs]

    metrics = {
        "category_accuracy": _accuracy(gold_categories, predicted_categories),
        "category_macro_f1": macro_f1(gold_categories, predicted_categories),
        "priority_exact": _accuracy(gold_priority, predicted_priority),
        "priority_within1": _mean([abs(g - p) <= 1 for g, p in zip(gold_priority, predicted_priority, strict=True)]),
        "priority_qwk": quadratic_kappa(gold_priority, predicted_priority),
        "priority_mae": _mean([abs(g - p) for g, p in zip(gold_priority, predicted_priority, strict=True)]),
        "register_accuracy": _accuracy(gold_register, predicted_register),
        "register_macro_f1": macro_f1(gold_register, predicted_register),
        "conflict_accuracy": _accuracy(
            [record.gold_calendar_conflict for record, _ in pairs], [prediction.conflict for _, prediction in pairs]
        ),
    }
    metrics.update(span_scores(pairs))
    metrics.update(date_resolution_scores(pairs))
    return metrics


def span_scores(pairs: Sequence[Pair]) -> dict[str, float]:
    counts = {label: [0, 0, 0] for label in SPAN_LABELS}  # tp, fp, fn
    for record, prediction in pairs:
        gold = {(span.label, span.start, span.end) for span in record.gold_spans}
        predicted = {(span.label, span.start, span.end) for span in prediction.spans}
        for label in SPAN_LABELS:
            gold_label = {span for span in gold if span[0] == label}
            predicted_label = {span for span in predicted if span[0] == label}
            counts[label][0] += len(gold_label & predicted_label)
            counts[label][1] += len(predicted_label - gold_label)
            counts[label][2] += len(gold_label - predicted_label)
    scores: dict[str, float] = {}
    for label in SPAN_LABELS:
        precision, recall, f1 = _prf(*counts[label])
        key = label.lower()
        scores[f"{key}_precision"], scores[f"{key}_recall"], scores[f"{key}_f1"] = precision, recall, f1
    total = [sum(counts[label][index] for label in SPAN_LABELS) for index in range(3)]
    scores["span_micro_f1"] = _prf(*total)[2]
    return scores


def date_resolution_scores(pairs: Sequence[Pair]) -> dict[str, float]:
    """End to end: a gold DATE counts only if a predicted span has the same
    offsets and the same resolution. On gold spans: the normalizer alone."""
    end_to_end: list[bool] = []
    on_gold: list[bool] = []
    for record, prediction in pairs:
        predicted = {(span.start, span.end): span for span in prediction.spans if span.label == "DATE"}
        gold_dates = [span for span in record.gold_spans if span.label == "DATE"]
        for index, gold in enumerate(gold_dates):
            expected = (gold.resolved, gold.ambiguous)
            match = predicted.get((gold.start, gold.end))
            end_to_end.append(match is not None and (match.resolved, match.ambiguous) == expected)
            if index < len(prediction.gold_date_resolutions):
                on_gold.append(tuple(prediction.gold_date_resolutions[index]) == expected)
    return {
        "date_resolution_accuracy": _mean(end_to_end),
        "date_resolution_on_gold_spans": _mean(on_gold),
    }


def macro_f1(gold: Sequence, predicted: Sequence) -> float:
    """Mean F1 over the classes present in gold or predictions (None is not a class)."""
    labels = sorted({label for label in (*gold, *predicted) if label is not None}, key=str)
    if not labels:
        return float("nan")
    scores = []
    for label in labels:
        tp = sum(g == label and p == label for g, p in zip(gold, predicted, strict=True))
        fp = sum(g != label and p == label for g, p in zip(gold, predicted, strict=True))
        fn = sum(g == label and p != label for g, p in zip(gold, predicted, strict=True))
        scores.append(_prf(tp, fp, fn)[2])
    return float(np.mean(scores))


def quadratic_kappa(gold: Sequence[int], predicted: Sequence[int]) -> float:
    if len(set(gold) | set(predicted)) < 2:
        return float("nan")
    value = cohen_kappa_score(list(gold), list(predicted), labels=list(PRIORITIES), weights="quadratic")
    return float(value)


def bootstrap(
    pairs: Sequence[Pair],
    *,
    samples: int = BOOTSTRAP_SAMPLES,
    seed: int = BOOTSTRAP_SEED,
    metric_fn: Callable[[Sequence[Pair]], dict[str, float]] = compute,
) -> dict[str, dict[str, float]]:
    """{metric: {value, low, high}}; low/high are the 95% percentile interval."""
    point = metric_fn(pairs)
    rng = np.random.default_rng(seed)
    draws: dict[str, list[float]] = {name: [] for name in point}
    size = len(pairs)
    for _ in range(samples):
        indices = rng.integers(0, size, size)
        sample = metric_fn([pairs[index] for index in indices])
        for name, value in sample.items():
            if not math.isnan(value):
                draws[name].append(value)
    result = {}
    for name, value in point.items():
        values = draws[name]
        low, high = (float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))) if values else (None, None)
        result[name] = {"value": None if math.isnan(value) else round(value, 4),
                        "low": None if low is None else round(low, 4),
                        "high": None if high is None else round(high, 4)}
    return result


def report(pairs: Sequence[Pair], **kwargs) -> dict:
    """Overall and per-language bootstrap results plus the number of emails in each scope."""
    scopes = {"overall": list(pairs)}
    for language in LANGUAGES:
        subset = [pair for pair in pairs if pair[0].language == language]
        if subset:
            scopes[language] = subset
    return {scope: {"n": len(subset), "metrics": bootstrap(subset, **kwargs)} for scope, subset in scopes.items()}


def confusion_matrix(pairs: Sequence[Pair], labels: Sequence[str]) -> dict[str, dict[str, int]]:
    columns = [*labels, "none"]
    matrix = {gold: dict.fromkeys(columns, 0) for gold in labels}
    for record, prediction in pairs:
        matrix[record.gold_category][prediction.category or "none"] += 1
    return matrix


def _prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return precision, recall, f1


def _accuracy(gold: Sequence, predicted: Sequence) -> float:
    return _mean([g == p for g, p in zip(gold, predicted, strict=True)])


def _mean(values: Sequence) -> float:
    return float(np.mean(values)) if len(values) else float("nan")
