"""The four evaluated systems.

B1  keyword/rule baseline: category from keyword lists and sender role; regex
    TASK/DATE tagger; rule priority (category base + deadline + role + calendar,
    VIP floor); rule register cues.
B2  zero-shot multilingual SBERT category (cosine to the category descriptions,
    threshold 0.35); everything else as B1.
B3  B2 plus tuned keyword/role boosts and Rocchio centroids from train
    (config/tuned.json, tuned on dev only); everything else as B1.
B4  full system: B3 category, the active Bi-LSTM-CRF tagger, learned priority
    and learned register (rules when a model file is missing).

Every system resolves DATE spans with app.nlp.date_codes and computes the
calendar-conflict flag deterministically from them.
"""

import json
import math
import re
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path

from app.algorithms.sequence_tagger import SequenceTagger
from app.ml import priority_model
from app.ml.linear import LinearModel
from app.ml.priority_rules import compute_priority
from app.nlp import register as register_nlp
from app.nlp.date_codes import has_conflict, resolve_phrase, resolved_datetime
from app.nlp.regex_tagger import has_deadline_marker_before
from app.nlp.regex_tagger import tag as regex_tag
from app.services.embeddings import model_manager

from .loaders import Category, Record, load_categories, load_split
from .metrics import PredictedSpan, Prediction

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
MODELS_DIR = ROOT / "models"
TUNED_PATH = CONFIG_DIR / "tuned.json"
SYSTEMS = ("B1", "B2", "B3", "B4")
ZERO_SHOT_THRESHOLD = 0.35


@dataclass(frozen=True)
class CategoryParams:
    threshold: float = ZERO_SHOT_THRESHOLD
    keyword_weight: float = 0.0
    role_weight: float = 0.0
    rocchio_alpha: float = 1.0
    rocchio_beta: float = 0.0


def load_tuned() -> CategoryParams | None:
    if not TUNED_PATH.exists():
        return None
    data = json.loads(TUNED_PATH.read_text(encoding="utf-8"))["category"]
    return CategoryParams(**{key: data[key] for key in CategoryParams.__dataclass_fields__})


def load_versioned(kind: str) -> tuple[LinearModel | None, str | None]:
    pointer = MODELS_DIR / kind / "current.json"
    if not pointer.exists():
        return None, None
    version = json.loads(pointer.read_text(encoding="utf-8"))["version"]
    path = MODELS_DIR / kind / version / "model.json"
    return (LinearModel.load(path), version) if path.exists() else (None, None)


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


@dataclass
class Context:
    """Shared, cached resources for one evaluation process."""

    categories: list[Category] = field(default_factory=load_categories)
    _embeddings: dict[str, list[float]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not model_manager.ready:
            model_manager.load()
        if not model_manager.ready:
            raise RuntimeError(f"Sentence-BERT failed to load: {model_manager.error}")
        rules = json.loads((CONFIG_DIR / "category_rules.json").read_text(encoding="utf-8"))
        self.rules = rules["categories"]
        self.uncategorized_base = rules["uncategorized_base_priority"]
        self._keyword_res = {
            slug: [re.compile(rf"(?<![\w-]){re.escape(word)}(?![\w-])") if word[0].isalnum() and word[-1].isalnum()
                   else re.compile(re.escape(word)) for word in spec["keywords"]]
            for slug, spec in self.rules.items()
        }

    # ---- embeddings -------------------------------------------------------
    def embedding(self, record: Record) -> list[float]:
        if record.id not in self._embeddings:
            self._embeddings[record.id] = model_manager.embed_email(record.subject, record.body)
        return self._embeddings[record.id]

    def warm(self, records: list[Record]) -> None:
        for record in records:
            self.embedding(record)

    @cached_property
    def description_vectors(self) -> dict[str, list[float]]:
        texts = [f"{category.name}: {category.description}" for category in self.categories]
        return dict(zip((category.slug for category in self.categories), model_manager.embed(texts), strict=True))

    @cached_property
    def train_means(self) -> dict[str, list[float]]:
        train = load_split("train")
        sums: dict[str, list[float]] = {}
        counts: dict[str, int] = {}
        for record in train:
            vector = self.embedding(record)
            total = sums.setdefault(record.gold_category, [0.0] * len(vector))
            for index, value in enumerate(vector):
                total[index] += value
            counts[record.gold_category] = counts.get(record.gold_category, 0) + 1
        return {slug: _normalize([value / counts[slug] for value in total]) for slug, total in sums.items()}

    def centroids(self, alpha: float, beta: float) -> dict[str, list[float]]:
        cache = self.__dict__.setdefault("_centroid_cache", {})
        if (alpha, beta) in cache:
            return cache[(alpha, beta)]
        result = cache[(alpha, beta)] = {}
        for slug, description in self.description_vectors.items():
            mean = self.train_means.get(slug, [0.0] * len(description))
            result[slug] = _normalize([alpha * d + beta * m for d, m in zip(description, mean, strict=True)])
        return result

    # ---- category -----------------------------------------------------------
    def keyword_hits(self, record: Record, slug: str) -> int:
        text = f"{record.subject}\n{record.body}".casefold()
        return sum(len(pattern.findall(text)) for pattern in self._keyword_res[slug])

    def role_match(self, record: Record, slug: str) -> float:
        return float(record.sender_role.strip().casefold() in self.rules[slug]["roles"])

    def b1_category(self, record: Record) -> tuple[str | None, dict[str, float]]:
        scores = {slug: self.keyword_hits(record, slug) + 0.5 * self.role_match(record, slug) for slug in self.rules}
        best = max(scores, key=scores.__getitem__)
        return (best if self.keyword_hits(record, best) > 0 else None), scores

    def sbert_category(
        self, record: Record, params: CategoryParams, centroids: dict[str, list[float]] | None = None
    ) -> tuple[str | None, dict[str, float]]:
        centroids = centroids or self.centroids(params.rocchio_alpha, params.rocchio_beta)
        vector = self.embedding(record)
        scores = {}
        for slug, centroid in centroids.items():
            score = _cosine(vector, centroid)
            score += params.keyword_weight * min(self.keyword_hits(record, slug), 3) / 3
            score += params.role_weight * self.role_match(record, slug)
            scores[slug] = round(score, 4)
        best = max(scores, key=scores.__getitem__)
        return (best if scores[best] >= params.threshold else None), scores

    def promo_score(self, record: Record) -> float:
        return _cosine(self.embedding(record), self.description_vectors["promotions"])

    # ---- spans --------------------------------------------------------------
    def resolve_spans(self, record: Record, raw: list[tuple[str, int, int]]) -> list[PredictedSpan]:
        spans = []
        for label, start, end in raw:
            resolved, ambiguous = (None, False)
            if label == "DATE":
                resolved, ambiguous = resolve_phrase(record.body[start:end], record.received_at)
            spans.append(PredictedSpan(label, start, end, resolved, ambiguous))
        return spans

    def regex_spans(self, record: Record) -> list[PredictedSpan]:
        return self.resolve_spans(record, [(span.label, span.start, span.end) for span in regex_tag(record.body)])

    @cached_property
    def crf(self) -> tuple[SequenceTagger | None, str | None]:
        pointer = MODELS_DIR / "tagger" / "current.json"
        if not pointer.exists():
            return None, None
        version = json.loads(pointer.read_text(encoding="utf-8"))["version"]
        return SequenceTagger.from_directory(MODELS_DIR / "tagger" / version), version

    def crf_spans(self, record: Record, tagger: SequenceTagger | None = None) -> list[PredictedSpan]:
        tagger = tagger or self.crf[0]
        if tagger is None:
            return self.regex_spans(record)
        return self.resolve_spans(record, [(span.label, span.start, span.end) for span in tagger.tag(record.body)])

    # ---- priority -----------------------------------------------------------
    def rule_priority(self, record: Record, category: str | None, spans: list[PredictedSpan]) -> int:
        base = self.rules[category]["base_priority"] if category else self.uncategorized_base
        has_task = any(span.label == "TASK" for span in spans)
        deadlines = []
        for span in spans:
            moment = resolved_datetime(span.resolved, record.received_at.tzinfo)
            if span.label != "DATE" or span.ambiguous or moment is None:
                continue
            if moment.date() >= record.received_at.date() and (
                has_task or has_deadline_marker_before(record.body, span.start)
            ):
                deadlines.append(moment)
        result = compute_priority(
            base_priority=base,
            validated_deadlines=deadlines,
            now=record.received_at,
            sender_role=record.sender_role,
            is_vip=record.is_vip,
            calendar_busy=[(period.start, period.end) for period in record.calendar_busy] or None,
        )
        return result.level

    def priority_features(self, record: Record, spans, register: str) -> list[float]:
        return priority_model.features(
            self.embedding(record),
            sender_role=record.sender_role,
            is_vip=record.is_vip,
            has_task=any(span.label == "TASK" for span in spans),
            deadline_proximity=priority_model.deadline_proximity(
                [span.resolved for span in spans if span.label == "DATE" and not span.ambiguous], record.received_at
            ),
            promo_score=self.promo_score(record),
            register=register,
        )


def conflict_flag(record: Record, spans: list[PredictedSpan]) -> bool:
    busy = [(period.start, period.end) for period in record.calendar_busy]
    return has_conflict([span.resolved for span in spans if span.label == "DATE" and not span.ambiguous], busy)


def gold_resolutions(record: Record) -> list[tuple[str | None, bool]]:
    return [resolve_phrase(span.text, record.received_at) for span in record.gold_spans if span.label == "DATE"]


def predict(system: str, record: Record, context: Context) -> Prediction:
    if system == "B1":
        category, scores = context.b1_category(record)
    elif system == "B2":
        category, scores = context.sbert_category(record, CategoryParams())
    else:
        category, scores = context.sbert_category(record, load_tuned() or CategoryParams())

    cues = register_nlp.cue_features(record.subject, record.body)
    if system != "B4":
        spans = context.regex_spans(record)
        register = register_nlp.rule_register(cues)
        priority = context.rule_priority(record, category, spans)
        why: list[dict] = []
    else:
        spans = context.crf_spans(record)
        register_model, _ = load_versioned("register")
        register = register_nlp.detect_register(
            record.subject, record.body, embedding=context.embedding(record), model=register_model
        ).register
        priority_lm, _ = load_versioned("priority")
        if priority_lm is None:
            priority, why = context.rule_priority(record, category, spans), []
        else:
            result = priority_model.predict(
                priority_lm,
                context.priority_features(record, spans, register),
                is_vip=record.is_vip,
                has_task=any(span.label == "TASK" for span in spans),
                category=category,
            )
            priority, why = result.level, result.why

    return Prediction(
        category=category,
        priority=priority,
        register=register,
        spans=spans,
        conflict=conflict_flag(record, spans),
        gold_date_resolutions=gold_resolutions(record),
        category_scores=scores,
        priority_why=why,
    )


def describe(system: str, context: Context) -> dict:
    """What a system actually used in this run (for the results file)."""
    info: dict = {"system": system}
    if system in {"B3", "B4"}:
        tuned = load_tuned()
        info["category_params"] = (tuned or CategoryParams()).__dict__ | {"source": "tuned.json" if tuned else "defaults"}
    elif system == "B2":
        info["category_params"] = CategoryParams().__dict__
    if system == "B4":
        info["tagger"] = context.crf[1] or "regex (no trained tagger)"
        info["priority_model"] = load_versioned("priority")[1] or "rules (no model file)"
        info["register_model"] = load_versioned("register")[1] or "rules (no model file)"
    else:
        info["tagger"], info["priority_model"], info["register_model"] = "regex", "rules", "rules"
    return info
