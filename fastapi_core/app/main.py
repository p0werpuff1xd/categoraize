"""CategorAIze NLP service: stateless FastAPI process called by the web app.

The web app sends category data with each request and stores the results;
this service keeps no per-user state.
"""

import os
import re
import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .algorithms.classifier import choose_category, cosine, rank_categories
from .algorithms.feedback import FeedbackError, update_centroids
from .algorithms.label_library import LABEL_TEMPLATES
from .algorithms.rule_matcher import RuleInput, choose_rule, load_rule_params, params_dict, prototype_language
from .algorithms.thread_status import ThreadMessage, asks_question, determine_status
from .ml import priority_model
from .ml.priority_model import PROMOTION_SLUG
from .ml.priority_rules import compute_category_priority, compute_priority
from .nlp.bulk_mail import AUTOMATED_CAP, detect_bulk, is_urgent_notice
from .nlp.span_filter import MAX_PLAIN_TASKS, filter_spans, has_request_cue, is_statement
from .nlp.date_codes import has_conflict, resolve_phrase, resolved_datetime
from .nlp.extractor import resolve_date
from .nlp.register import detect_register
from .nlp.language import detect_language
from .nlp.pii import mask_pii
from .nlp.regex_tagger import has_deadline_marker_before
from .nlp.summarizer import split_sentences, summarize
from .nlp.taglish_cleaner import normalize
from .schemas import (
    CategoryInput,
    CategoryMatch,
    CentroidOutput,
    ChooseRuleRequest,
    ChooseRuleResponse,
    ClassifyRequest,
    ClassifyResponse,
    ClusterResult,
    DiscoverRequest,
    DiscoverResponse,
    EmbedRequest,
    EmbedResponse,
    LearnedPriority,
    LearnedPriorityReason,
    FeedbackRequest,
    FeedbackResponse,
    MatchRequest,
    MatchResponse,
    Priority,
    PriorityFactors,
    PriorityRequest,
    PriorityResponse,
    RegisterRequest,
    RegisterResponse,
    SenderRegister,
    Span,
    SuggestedLabel,
    SummarizeRequest,
    SummarizeResponse,
    TaskSpan,
    TasksRequest,
    TasksResponse,
    ThreadStatusRequest,
    ThreadStatusResponse,
)
from .security import auth_failures, harden_request
from .services.embeddings import MODEL_NAME, VECTOR_DIMENSION, model_manager
from .services.learned import learned_models
from .services.tagger import tagger_manager

SERVICE_VERSION = "0.3.0"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.getenv("CATEGORAIZE_SKIP_MODEL_LOAD") != "1":
        model_manager.start_background_load()
        tagger_manager.active()
        learned_models.load()
    yield


app = FastAPI(title="CategorAIze NLP Service", version=SERVICE_VERSION, lifespan=lifespan)
# Size and rate limits (IAS Phase 10 H). No CORS middleware on purpose.
app.middleware("http")(harden_request)


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("CATEGORAIZE_INTERNAL_KEY")
    # Fail closed: without a configured key no request is trusted.
    if not expected or not x_internal_key or not secrets.compare_digest(x_internal_key, expected):
        auth_failures.record()
        raise HTTPException(status_code=401, detail="missing or invalid X-Internal-Key")


def require_model_ready() -> None:
    if not model_manager.ready:
        detail = "model failed to load" if model_manager.status == "error" else "model is loading"
        raise HTTPException(status_code=503, detail=detail, headers={"Retry-After": "5"})


@app.exception_handler(FeedbackError)
async def feedback_error_handler(_request: Request, error: FeedbackError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(error)})


# Cloud Run's front end reserves public paths ending in "z" (such as /healthz),
# so /health is the public alias the web app calls.
@app.get("/health")
@app.get("/healthz")
def healthz() -> JSONResponse:
    body = {
        "status": model_manager.status,
        "service": "categoraize-nlp",
        "version": SERVICE_VERSION,
        "model": MODEL_NAME,
        "dimension": VECTOR_DIMENSION,
        "tagger": tagger_manager.describe(),
        "learned_models": learned_models.describe(),
        "auth_failures": auth_failures.count,
    }
    return JSONResponse(status_code=200 if model_manager.ready else 503, content=body)


@app.post(
    "/api/v1/embed",
    response_model=EmbedResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def embed(request: EmbedRequest) -> EmbedResponse:
    texts = [_mask(text) for text in request.texts]
    texts = [_search_gloss(text) for text in texts] if request.gloss else texts
    return EmbedResponse(model=MODEL_NAME, dimension=VECTOR_DIMENSION, vectors=model_manager.embed(texts))


@app.post(
    "/api/v1/classify",
    response_model=ClassifyResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def classify(request: ClassifyRequest) -> ClassifyResponse:
    started = time.perf_counter()
    timings: dict[str, float] = {}

    # IAS Phase 11 J: mask PII before any processing. The web app masks first;
    # it sends mask_pii=false only for a user who turned masking off, so span
    # offsets always match the text the web app stores.
    pii_counts: dict[str, int] = {"phone": 0, "card": 0, "gov_id": 0}
    if request.mask_pii:
        subject, body = mask_pii(request.subject), mask_pii(request.body)
        for counts in (subject.counts, body.counts):
            for key, value in counts.as_dict().items():
                pii_counts[key] += value
        request = request.model_copy(update={"subject": subject.text, "body": body.text})

    missing_centroids = [category for category in request.categories if category.centroid is None]
    email_text = f"{request.subject}\n\n{request.body}".strip()
    email_vector = model_manager.embed_email(request.subject, request.body)
    description_vectors = dict(
        zip(
            (category.id for category in missing_centroids),
            model_manager.embed([_category_text(category) for category in missing_centroids]),
        )
    )
    timings["embed"] = _elapsed_ms(started)

    step = time.perf_counter()
    ranked = rank_categories(
        email_vector,
        [(category.id, category.centroid or description_vectors[category.id]) for category in request.categories],
    )
    chosen = choose_category(ranked, request.threshold)
    if request.pinned_category_id is not None:
        chosen = next((item for item in ranked if item.id == request.pinned_category_id), None)
        if chosen is None:
            raise HTTPException(status_code=422, detail="pinned_category_id is not in categories")
    suggestion = None if chosen else _suggest_label(email_vector, request)
    timings["classify"] = _elapsed_ms(step)

    step = time.perf_counter()
    spans = _extract_spans(request)
    language = detect_language(email_text)
    timings["tagging"] = _elapsed_ms(step)

    base_priority = request.uncategorized_base_priority
    category_slug = None
    ignore_extracted_deadlines = False
    if chosen:
        chosen_category = next(category for category in request.categories if category.id == chosen.id)
        base_priority = chosen_category.base_priority
        category_slug = chosen_category.slug
    else:
        # No user label claimed it: marketing mail is treated as Promotions and
        # dates in automated mail are template text, not deadlines.
        bulk = detect_bulk(request.subject, request.body, request.sender.email)
        if bulk.promotional:
            category_slug = PROMOTION_SLUG
            # Marketing copy about "security" or "support" pulled the template
            # match the wrong way; the bulk signal is more reliable.
            suggestion = _template_suggestion("newsletters" if bulk.newsletter else "promotions", request) or suggestion
        ignore_extracted_deadlines = bulk.automated
    spans = filter_spans(spans, promotional=category_slug == PROMOTION_SLUG, automated=ignore_extracted_deadlines)
    automated_notice = ignore_extracted_deadlines and not is_urgent_notice(request.subject)
    if ignore_extracted_deadlines:
        for span in spans:
            span.is_deadline = False  # shown as a date, never as a deadline
    extracted_deadlines = [] if ignore_extracted_deadlines else [
        span.resolved for span in spans if span.is_deadline and not span.ambiguous and span.resolved
    ]
    priority = compute_category_priority(
        base_priority=base_priority,
        category_slug=category_slug,
        extracted_deadlines=extracted_deadlines,
        confirmed_deadlines=request.confirmed_deadlines,
        now=request.now or datetime.now(request.received_at.tzinfo),
        sender_role=request.sender.role,
        is_vip=request.sender.is_vip,
        calendar_busy=[(period.start, period.end) for period in request.calendar_busy]
        if request.calendar_busy is not None
        else None,
    )
    register = detect_register(request.subject, request.body, embedding=email_vector,
                               model=learned_models.get("register"))
    learned = _learned_priority(request, email_vector, spans, base_priority, register.register,
                                is_promotion=category_slug == PROMOTION_SLUG,
                                ignore_dates=ignore_extracted_deadlines or category_slug == PROMOTION_SLUG)
    if automated_notice:
        # Receipts, export notices and account notices: informational, at most
        # Normal. Security alerts and verification codes keep their level.
        priority = replace(priority, level=min(priority.level, AUTOMATED_CAP))
        if learned is not None and learned.level > AUTOMATED_CAP:
            learned = learned.model_copy(update={"level": AUTOMATED_CAP,
                                                 "guardrails": [*learned.guardrails, "automated_cap"]})
    timings["total"] = _elapsed_ms(started)

    return ClassifyResponse(
        email_id=request.email_id,
        language=language,
        category=CategoryMatch(id=chosen.id, similarity=chosen.similarity) if chosen else None,
        ranked=[CategoryMatch(id=item.id, similarity=item.similarity) for item in ranked],
        threshold=request.threshold,
        suggested_label=suggestion,
        spans=spans,
        priority=Priority(level=priority.level, factors=PriorityFactors(**priority.factors), deadline=priority.deadline),
        embedding=email_vector,
        timings_ms=timings,
        pii_masked=pii_counts,
        learned_priority=learned,
        sender_register=SenderRegister(value=register.register, source=register.source),
    )


# The user's per-category base priority is applied as an offset from this default
# after the learned model (master plan amendment 2026-11-17); a base of P1 marks a
# promotional/ignorable category and caps the level at P2.
DEFAULT_BASE_PRIORITY = 3
# A timed date this close to receipt is the email's own timestamp, not a deadline.
RECEIPT_TIMESTAMP_SLACK = timedelta(minutes=10)
# A suggested label must beat the next template by this much cosine similarity.
SUGGESTION_MARGIN = 0.03
IGNORABLE_BASE_PRIORITY = 1


def _learned_priority(request: ClassifyRequest, email_vector: list[float], spans: list[Span],
                      base_priority: int, register: str, *, is_promotion: bool = False,
                      ignore_dates: bool = False) -> LearnedPriority | None:
    model = learned_models.get("priority")
    if model is None:
        return None
    received = request.received_at.astimezone(ZoneInfo(request.timezone))
    has_task = any(span.label == "TASK" for span in spans)
    dates = [] if ignore_dates else [
        span.resolved.isoformat() for span in spans
        if span.label == "DATE" and span.resolved is not None and not span.ambiguous
    ]
    promo_vector = model.meta.get("promo_vector") or [0.0] * len(email_vector)
    result = priority_model.predict(
        model,
        priority_model.features(
            email_vector,
            sender_role=request.sender.role,
            is_vip=request.sender.is_vip,
            has_task=has_task,
            deadline_proximity=priority_model.deadline_proximity(dates, received),
            promo_score=cosine(email_vector, promo_vector),
            register=register,
        ),
        is_vip=request.sender.is_vip,
        has_task=has_task,
        category=priority_model.PROMOTION_SLUG
        if is_promotion or base_priority == IGNORABLE_BASE_PRIORITY
        else None,
        offset=base_priority - DEFAULT_BASE_PRIORITY,
    )
    return LearnedPriority(
        level=result.level,
        model_level=result.model_level,
        category_offset=result.offset,
        why=[LearnedPriorityReason(**reason) for reason in result.why],
        guardrails=result.guardrails,
    )


@app.post(
    "/api/v1/match",
    response_model=MatchResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def match(request: MatchRequest) -> MatchResponse:
    started = time.perf_counter()
    request = request.model_copy(update={"subject": _mask(request.subject), "body": _mask(request.body)})
    query_vector = model_manager.embed_email(request.subject, request.body)
    needs_text = [candidate for candidate in request.candidates if candidate.centroid is None]
    text_vectors = dict(
        zip((candidate.id for candidate in needs_text), model_manager.embed([c.text for c in needs_text]))
    )
    ranked = rank_categories(
        query_vector,
        [(candidate.id, candidate.centroid or text_vectors[candidate.id]) for candidate in request.candidates],
    )
    best = choose_category(ranked, request.threshold)
    _name, tag, _version = tagger_manager.active()
    has_task = any(span.label == "TASK" for text in (request.subject, request.body) for span in tag(text))
    return MatchResponse(
        ranked=[CategoryMatch(id=item.id, similarity=item.similarity) for item in ranked],
        best=CategoryMatch(id=best.id, similarity=best.similarity) if best else None,
        threshold=request.threshold,
        embedding=query_vector,
        has_task=has_task,
        timings_ms={"total": _elapsed_ms(started)},
    )


@app.post(
    "/api/v1/choose-rule",
    response_model=ChooseRuleResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def choose_rule_endpoint(request: ChooseRuleRequest) -> ChooseRuleResponse:
    request = request.model_copy(update={"subject": _mask(request.subject), "body": _mask(request.body)})
    params = load_rule_params()
    _name, tag, _version = tagger_manager.active()
    has_request = asks_question(request.body) or any(
        span.label == "TASK" for text in (request.subject, request.body) for span in tag(text)
    )
    decision = choose_rule(
        model_manager.embed_email(request.subject, request.body),
        [
            RuleInput(rule.id, rule.name, rule.instructions, rule.reply_needed, rule.system_type)
            for rule in request.rules
        ],
        has_request=has_request,
        allow_multiple=request.allow_multiple,
        embed=_embed_cached,
        params=params,
        language=prototype_language(f"{request.subject}\n{request.body}"),
    )
    return ChooseRuleResponse(
        ranked=[CategoryMatch(id=rule_id, similarity=score) for rule_id, score in decision.ranked],
        matched=decision.matched,
        confident=decision.confident,
        reasons=decision.reasons,
        has_request=has_request,
        params=params_dict(params),
    )


@app.post(
    "/api/v1/thread-status",
    response_model=ThreadStatusResponse,
    dependencies=[Depends(require_internal_key)],
)
def thread_status_endpoint(request: ThreadStatusRequest) -> ThreadStatusResponse:
    _name, tag, _version = tagger_manager.active()
    decision = determine_status(
        [ThreadMessage(m.from_user, _mask(m.subject), _mask(m.body), m.automated) for m in request.messages], tag
    )
    return ThreadStatusResponse(
        status=decision.status, confident=decision.confident, reason=decision.reason, signals=decision.signals
    )


@app.post(
    "/api/v1/summarize",
    response_model=SummarizeResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def summarize_email(request: SummarizeRequest) -> SummarizeResponse:
    _name, tag, _version = tagger_manager.active()
    body, subject = _mask(request.body), _mask(request.subject)
    sentences = split_sentences(body) or split_sentences(subject)
    return SummarizeResponse(
        sentences=summarize(
            sentences,
            embed=model_manager.embed,
            span_labels=lambda sentence: {span.label for span in tag(sentence)},
            limit=request.max_sentences,
        )
    )


@app.post(
    "/api/v1/feedback",
    response_model=FeedbackResponse,
    dependencies=[Depends(require_internal_key)],
)
def feedback(request: FeedbackRequest) -> FeedbackResponse:
    correct, incorrect = update_centroids(
        email=request.embedding,
        correct=request.correct.centroid,
        incorrect=request.incorrect.centroid if request.incorrect else None,
        correct_id=request.correct.id,
        incorrect_id=request.incorrect.id if request.incorrect else None,
        alpha=request.alpha,
        beta=request.beta,
    )
    return FeedbackResponse(
        correct=CentroidOutput(id=request.correct.id, centroid=correct),
        incorrect=CentroidOutput(id=request.incorrect.id, centroid=incorrect)
        if request.incorrect and incorrect is not None
        else None,
        alpha=request.alpha,
        beta=request.beta,
    )


@app.post(
    "/api/v1/discover",
    response_model=DiscoverResponse,
    dependencies=[Depends(require_internal_key)],
)
def discover(request: DiscoverRequest) -> DiscoverResponse:
    """Cluster uncategorized email vectors into candidate categories.

    The web app sends only IDs and pre-computed vectors (never text). Clusters
    are formed with agglomerative clustering using cosine distance; scikit-learn's
    HDBSCAN is used instead when available and min_cluster_size > 2. The caller
    derives candidate names from the user's own emails; this endpoint never
    creates categories automatically.
    """
    import math

    import numpy as np

    vectors_np = np.array([item.vector for item in request.vectors], dtype=np.float32)
    ids = [item.id for item in request.vectors]
    n = len(ids)

    # Normalize for cosine distance.
    norms = np.linalg.norm(vectors_np, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    vectors_norm = vectors_np / norms

    # Choose algorithm: HDBSCAN when available (sklearn ≥ 1.3), else agglomerative.
    labels: np.ndarray
    try:
        from sklearn.cluster import HDBSCAN

        clusterer = HDBSCAN(
            min_cluster_size=request.min_cluster_size,
            min_samples=1,
            metric="cosine",
            cluster_selection_epsilon=0.0,
        )
        labels = clusterer.fit_predict(vectors_norm)
    except ImportError:
        from sklearn.cluster import AgglomerativeClustering

        n_clusters = max(2, n // request.min_cluster_size)
        clusterer = AgglomerativeClustering(n_clusters=n_clusters, metric="cosine", linkage="average")
        labels = clusterer.fit_predict(vectors_norm)

    # Group by label; label -1 is noise.
    groups: dict[int, list[int]] = {}
    for index, label in enumerate(labels.tolist()):
        groups.setdefault(label, []).append(index)

    clusters: list[ClusterResult] = []
    noise_ids: list[str] = [ids[i] for i in groups.get(-1, [])]

    for label, indices in sorted(groups.items()):
        if label == -1 or len(indices) < request.min_cluster_size:
            noise_ids.extend(ids[i] for i in indices)
            continue
        members = vectors_norm[indices]
        centroid_raw = members.mean(axis=0)
        c_norm = np.linalg.norm(centroid_raw)
        centroid = (centroid_raw / c_norm if c_norm > 0 else centroid_raw).tolist()
        # Cohesion: mean cosine similarity of members to centroid.
        cohesion = float(np.mean(members @ np.array(centroid, dtype=np.float32)))
        # Round to 4 decimal places; guard against non-finite from degenerate inputs.
        cohesion = round(cohesion, 4) if math.isfinite(cohesion) else 0.0
        clusters.append(ClusterResult(
            cluster_id=label,
            member_ids=[ids[i] for i in indices],
            centroid=centroid,
            cohesion=cohesion,
        ))

    return DiscoverResponse(clusters=clusters, noise_ids=noise_ids)


@app.post("/api/v1/tasks", response_model=TasksResponse, dependencies=[Depends(require_internal_key)])
def tasks_endpoint(request: TasksRequest) -> TasksResponse:
    subject, body = _masked_text(request)
    received = request.received_at.astimezone(ZoneInfo(request.timezone))
    spans = _task_spans(subject, body, received)
    busy = [(period.start, period.end) for period in request.calendar_busy] if request.calendar_busy else None
    name, _, version = tagger_manager.active()
    return TasksResponse(
        spans=spans,
        calendar_checked=request.calendar_busy is not None,
        calendar_conflict=has_conflict([span.resolved for span in spans if span.label == "DATE"], busy),
        tagger={"name": name, "version": version},
    )


@app.post("/api/v1/register", response_model=RegisterResponse, dependencies=[Depends(require_internal_key)])
def register_endpoint(request: RegisterRequest) -> RegisterResponse:
    subject, body = _masked_text(request)
    model = learned_models.get("register")
    embedding = None
    if model is not None:
        require_model_ready()
        embedding = model_manager.embed_email(subject, body)
    result = detect_register(subject, body, embedding=embedding, model=model)
    return RegisterResponse(register=result.register, source=result.source, probabilities=result.probabilities,
                            cues=result.cues)


@app.post("/api/v1/priority", response_model=PriorityResponse, dependencies=[Depends(require_internal_key)])
def priority_endpoint(request: PriorityRequest) -> PriorityResponse:
    subject, body = _masked_text(request)
    received = request.received_at.astimezone(ZoneInfo(request.timezone))
    spans = _task_spans(subject, body, received)
    has_task = any(span.label == "TASK" for span in spans)
    dates = [span.resolved for span in spans if span.label == "DATE" and not span.ambiguous]
    proximity = priority_model.deadline_proximity(dates, received)
    category = priority_model.PROMOTION_SLUG if request.is_promotion else None

    register_lm, priority_lm = learned_models.get("register"), learned_models.get("priority")
    embedding = None
    if register_lm is not None or priority_lm is not None:
        require_model_ready()
        embedding = model_manager.embed_email(subject, body)
    register = detect_register(subject, body, embedding=embedding, model=register_lm).register

    if priority_lm is not None and embedding is not None:
        promo_vector = priority_lm.meta.get("promo_vector") or [0.0] * len(embedding)
        feature_vector = priority_model.features(
            embedding,
            sender_role=request.sender.role,
            is_vip=request.sender.is_vip,
            has_task=has_task,
            deadline_proximity=proximity,
            promo_score=cosine(embedding, promo_vector),
            register=register,
        )
        result = priority_model.predict(priority_lm, feature_vector, is_vip=request.sender.is_vip, has_task=has_task,
                                        category=category, override=request.override_priority)
        level, source, why, guardrails = result.level, result.source, result.why, result.guardrails
    else:
        level, why, guardrails = _rule_priority(request, {"subject": subject, "body": body}, spans, received,
                                                has_task, category)
        source = "rules"
    return PriorityResponse(level=level, source=source, why=why, guardrails=guardrails, register=register,
                            has_task=has_task, deadline_proximity=round(proximity, 4))


def _rule_priority(request: PriorityRequest, texts: dict[str, str], spans: list[TaskSpan], received: datetime,
                   has_task: bool, category: str | None) -> tuple[int, list[dict], list[str]]:
    deadlines = []
    for span in spans:
        moment = resolved_datetime(span.resolved, received.tzinfo) if span.label == "DATE" else None
        if moment is None or span.ambiguous or moment.date() < received.date():
            continue
        if has_task or has_deadline_marker_before(texts[span.source], span.start):
            deadlines.append(moment)
    result = compute_priority(
        base_priority=request.category_base_priority,
        validated_deadlines=deadlines,
        now=received,
        sender_role=request.sender.role,
        is_vip=request.sender.is_vip,
        calendar_busy=[(p.start, p.end) for p in request.calendar_busy] if request.calendar_busy else None,
    )
    # VIP floor is already part of the rules; only the cap and the override remain.
    level, guardrails = priority_model.apply_guardrails(
        result.level, is_vip=False, has_task=has_task, category=category, override=request.override_priority
    )
    if result.factors["vip_pin"]:
        guardrails.insert(0, "vip_floor")
    ranked = sorted(((name, value) for name, value in result.factors.items() if value), key=lambda item: -abs(item[1]))
    return level, [{"factor": name.replace("_", " "), "contribution": float(value)} for name, value in ranked[:3]], guardrails


def _task_spans(subject: str, body: str, received: datetime) -> list[TaskSpan]:
    _name, tag, _version = tagger_manager.active()
    spans: list[TaskSpan] = []
    for source, text in (("subject", subject), ("body", body)):
        for raw in tag(text):
            resolved, ambiguous = resolve_phrase(raw.text, received) if raw.label == "DATE" else (None, False)
            spans.append(TaskSpan(label=raw.label, text=raw.text, source=source, start=raw.start, end=raw.end,
                                  resolved=resolved, ambiguous=ambiguous))
    return spans


def _masked_text(request) -> tuple[str, str]:
    if not request.mask_pii:
        return request.subject, request.body
    return _mask(request.subject), _mask(request.body)


def _mask(text: str) -> str:
    """IAS Phase 11 J: phone, card and government ID numbers never reach the models."""
    return mask_pii(text).text


def _search_gloss(text: str) -> str:
    """Filipino/Taglish search text becomes its English gloss; English stays as is.

    A short Filipino query otherwise matches other Filipino emails by language
    rather than the English email it is about.
    """
    if detect_language(text) in {"tl", "mixed"}:
        return normalize(text) or text
    return text


_DESCRIPTION_CACHE: dict[str, list[float]] = {}
_DESCRIPTION_CACHE_LIMIT = 5000


def _embed_cached(texts: list[str]) -> list[list[float]]:
    """Rule descriptions repeat on every email; embed each one once."""
    missing = [text for text in dict.fromkeys(texts) if text not in _DESCRIPTION_CACHE]
    if missing:
        if len(_DESCRIPTION_CACHE) + len(missing) > _DESCRIPTION_CACHE_LIMIT:
            _DESCRIPTION_CACHE.clear()
        _DESCRIPTION_CACHE.update(zip(missing, model_manager.embed(missing)))
    return [_DESCRIPTION_CACHE[text] for text in texts]


def _category_text(category: CategoryInput) -> str:
    return f"{category.name}: {category.description}" if category.description else category.name


def _template_suggestion(key: str, request: ClassifyRequest) -> SuggestedLabel | None:
    """A library label by key, unless the user already has one with that name."""
    template = next((item for item in LABEL_TEMPLATES if item.key == key), None)
    existing = {category.name.casefold() for category in request.categories}
    if template is None or template.name.casefold() in existing:
        return None
    return SuggestedLabel(key=template.key, name=template.name, description=template.description, similarity=1.0)


def _suggest_label(email_vector: list[float], request: ClassifyRequest) -> SuggestedLabel | None:
    existing = {category.name.casefold() for category in request.categories}
    template_vectors = model_manager.template_vectors()
    scored = sorted(
        (
            (cosine(email_vector, template_vectors[template.key]), template)
            for template in LABEL_TEMPLATES
            if template.name.casefold() not in existing and template.key in template_vectors
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    if not scored:
        return None
    similarity, template = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else -1.0
    # Only a clear winner: near-ties ("Support" vs "Security" for a CI failure)
    # suggested the wrong label for most mail.
    if similarity < request.threshold or similarity - runner_up < SUGGESTION_MARGIN:
        return None
    return SuggestedLabel(key=template.key, name=template.name, description=template.description, similarity=similarity)


def _extract_spans(request: ClassifyRequest) -> list[Span]:
    spans: list[Span] = []
    received_day = request.received_at.astimezone(ZoneInfo(request.timezone)).date()
    tagger_name, tag, _version = tagger_manager.active()
    for source, text in (("subject", request.subject), ("body", request.body)):
        raw_spans = tag(text)
        # Same rule as filter_spans: statements are not tasks, and an essay
        # full of tagged sentences counts only its explicit requests.
        task_texts = [span.text for span in raw_spans if span.label == "TASK" and not is_statement(span.text)]
        has_task = (
            any(has_request_cue(task) for task in task_texts)
            if len(task_texts) > MAX_PLAIN_TASKS
            else bool(task_texts)
        )
        for raw in raw_spans:
            span_text, span_start = raw.text, raw.start
            if raw.label == "DATE":
                # "sa Lunes", "sa 10 AM bukas": the preposition is not part of the date.
                lead = re.match(r"(?:sa|nang|ng)\s+(?=\S)", span_text, re.IGNORECASE)
                if lead:
                    span_text, span_start = span_text[lead.end():], span_start + lead.end()
            span = Span(
                label=raw.label, text=span_text, source=source, start=span_start, end=raw.end, tagger=tagger_name
            )
            if raw.label == "DATE":
                resolved = resolve_date(span_text, received_at=request.received_at, timezone=request.timezone)
                # Dates before the email are references (order times, alert
                # timestamps, last year's event), never deadlines: drop them. A
                # timed value within minutes of receipt is the message's own
                # timestamp ("22 Nov 2026 22:08" on a payment alert).
                if resolved.value is not None and (
                    resolved.value <= request.received_at + RECEIPT_TIMESTAMP_SLACK
                    if resolved.has_time
                    else resolved.value.date() < received_day
                ):
                    continue
                span.resolved = resolved.value
                span.ambiguous = resolved.ambiguous
                # A date only counts as a deadline when it is attached to a request and not in the past.
                span.is_deadline = bool(
                    resolved.value
                    and resolved.value.date() >= received_day
                    and (has_task or has_deadline_marker_before(text, raw.start))
                )
            spans.append(span)
    return spans


def _elapsed_ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000, 2)

