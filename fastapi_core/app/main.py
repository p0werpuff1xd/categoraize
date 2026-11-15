"""CategorAIze NLP service: stateless FastAPI process called by the web app.

The web app sends category data with each request and stores the results;
this service keeps no per-user state.
"""

import os
import secrets
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .algorithms.classifier import choose_category, cosine, rank_categories
from .algorithms.feedback import FeedbackError, update_centroids
from .algorithms.label_library import LABEL_TEMPLATES
from .algorithms.rule_matcher import RuleInput, choose_rule, load_rule_params, params_dict, prototype_language
from .algorithms.thread_status import ThreadMessage, asks_question, determine_status
from .ml.priority_rules import compute_priority
from .nlp.extractor import resolve_date
from .nlp.language import detect_language
from .nlp.regex_tagger import has_deadline_marker_before
from .nlp.summarizer import split_sentences, summarize
from .schemas import (
    CategoryInput,
    CategoryMatch,
    CentroidOutput,
    ChooseRuleRequest,
    ChooseRuleResponse,
    ClassifyRequest,
    ClassifyResponse,
    EmbedRequest,
    EmbedResponse,
    FeedbackRequest,
    FeedbackResponse,
    MatchRequest,
    MatchResponse,
    Priority,
    PriorityFactors,
    Span,
    SuggestedLabel,
    SummarizeRequest,
    SummarizeResponse,
    ThreadStatusRequest,
    ThreadStatusResponse,
)
from .services.embeddings import MODEL_NAME, VECTOR_DIMENSION, model_manager
from .services.tagger import tagger_manager

SERVICE_VERSION = "0.3.0"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if os.getenv("CATEGORAIZE_SKIP_MODEL_LOAD") != "1":
        model_manager.start_background_load()
        tagger_manager.active()
    yield


app = FastAPI(title="CategorAIze NLP Service", version=SERVICE_VERSION, lifespan=lifespan)


def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("CATEGORAIZE_INTERNAL_KEY")
    # Fail closed: without a configured key no request is trusted.
    if not expected or not x_internal_key or not secrets.compare_digest(x_internal_key, expected):
        raise HTTPException(status_code=401, detail="missing or invalid X-Internal-Key")


def require_model_ready() -> None:
    if not model_manager.ready:
        detail = "model failed to load" if model_manager.status == "error" else "model is loading"
        raise HTTPException(status_code=503, detail=detail, headers={"Retry-After": "5"})


@app.exception_handler(FeedbackError)
async def feedback_error_handler(_request: Request, error: FeedbackError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(error)})


@app.get("/healthz")
def healthz() -> JSONResponse:
    body = {
        "status": model_manager.status,
        "service": "categoraize-nlp",
        "version": SERVICE_VERSION,
        "model": MODEL_NAME,
        "dimension": VECTOR_DIMENSION,
        "tagger": tagger_manager.describe(),
    }
    return JSONResponse(status_code=200 if model_manager.ready else 503, content=body)


@app.post(
    "/api/v1/embed",
    response_model=EmbedResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def embed(request: EmbedRequest) -> EmbedResponse:
    return EmbedResponse(model=MODEL_NAME, dimension=VECTOR_DIMENSION, vectors=model_manager.embed(request.texts))


@app.post(
    "/api/v1/classify",
    response_model=ClassifyResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def classify(request: ClassifyRequest) -> ClassifyResponse:
    started = time.perf_counter()
    timings: dict[str, float] = {}

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
    if chosen:
        base_priority = next(category.base_priority for category in request.categories if category.id == chosen.id)
    validated_deadlines = [
        *request.confirmed_deadlines,
        *(span.resolved for span in spans if span.is_deadline and not span.ambiguous and span.resolved),
    ]
    priority = compute_priority(
        base_priority=base_priority,
        validated_deadlines=validated_deadlines,
        now=request.now or datetime.now(request.received_at.tzinfo),
        sender_role=request.sender.role,
        is_vip=request.sender.is_vip,
        calendar_busy=[(period.start, period.end) for period in request.calendar_busy]
        if request.calendar_busy is not None
        else None,
    )
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
    )


@app.post(
    "/api/v1/match",
    response_model=MatchResponse,
    dependencies=[Depends(require_internal_key), Depends(require_model_ready)],
)
def match(request: MatchRequest) -> MatchResponse:
    started = time.perf_counter()
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
        [ThreadMessage(m.from_user, m.subject, m.body, m.automated) for m in request.messages], tag
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
    sentences = split_sentences(request.body) or split_sentences(request.subject)
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


def _suggest_label(email_vector: list[float], request: ClassifyRequest) -> SuggestedLabel | None:
    existing = {category.name.casefold() for category in request.categories}
    template_vectors = model_manager.template_vectors()
    best: SuggestedLabel | None = None
    for template in LABEL_TEMPLATES:
        if template.name.casefold() in existing or template.key not in template_vectors:
            continue
        similarity = cosine(email_vector, template_vectors[template.key])
        if similarity >= request.threshold and (best is None or similarity > best.similarity):
            best = SuggestedLabel(
                key=template.key, name=template.name, description=template.description, similarity=similarity
            )
    return best


def _extract_spans(request: ClassifyRequest) -> list[Span]:
    spans: list[Span] = []
    received_day = request.received_at.astimezone(ZoneInfo(request.timezone)).date()
    tagger_name, tag, _version = tagger_manager.active()
    for source, text in (("subject", request.subject), ("body", request.body)):
        raw_spans = tag(text)
        has_task = any(span.label == "TASK" for span in raw_spans)
        for raw in raw_spans:
            span = Span(
                label=raw.label, text=raw.text, source=source, start=raw.start, end=raw.end, tagger=tagger_name
            )
            if raw.label == "DATE":
                resolved = resolve_date(raw.text, received_at=request.received_at, timezone=request.timezone)
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

