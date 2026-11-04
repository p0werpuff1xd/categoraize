import os
import secrets
from fastapi import Depends, FastAPI, Header, HTTPException
from datetime import UTC, datetime

from .algorithms.cosine_similarity import rank_categories
from .algorithms.priority_scoring import calculate_priority
from .algorithms.rocchio import update_centroids
from .nlp.extraction import extract_deadlines, extract_instructions
from .nlp.preprocessing import preprocess
from .nlp.summarizer import summarize
from .schemas import (
    ClassificationRequest,
    ClassificationResponse,
    EmbeddingRequest,
    EmbeddingResponse,
    FeedbackRequest,
    FeedbackResponse,
)
from .services.embeddings import MODEL_NAME, VECTOR_DIMENSION, embed_texts

app = FastAPI(title="CategorAIze Intelligence Service", version="0.1.0")


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("NLP_SERVICE_TOKEN")
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing intelligence service token")
    provided = authorization.removeprefix("Bearer ")
    if not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid intelligence service token")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "categoraiize-intelligence",
        "version": app.version,
    }


@app.post(
    "/api/v1/embed",
    response_model=EmbeddingResponse,
    dependencies=[Depends(require_service_token)],
)
def embed(request: EmbeddingRequest) -> EmbeddingResponse:
    try:
        embeddings = embed_texts(request.texts)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return EmbeddingResponse(
        model=MODEL_NAME,
        dimension=VECTOR_DIMENSION,
        embeddings=embeddings,
    )


@app.post(
    "/api/v1/feedback",
    response_model=FeedbackResponse,
    dependencies=[Depends(require_service_token)],
)
def feedback(request: FeedbackRequest) -> FeedbackResponse:
    correct, incorrect = update_centroids(
        correct=request.correct_centroid,
        incorrect=request.incorrect_centroid,
        email=request.email_vector,
        alpha=request.alpha,
        beta=request.beta,
    )
    return FeedbackResponse(
        correct_centroid=correct,
        incorrect_centroid=incorrect,
        alpha=request.alpha,
        beta=request.beta,
    )


@app.post(
    "/api/v1/classify",
    response_model=ClassificationResponse,
    dependencies=[Depends(require_service_token)],
)
def classify(request: ClassificationRequest) -> ClassificationResponse:
    ranked = rank_categories(
        request.email_vector,
        [(category.id, category.vector) for category in request.categories],
        request.threshold,
    )
    winner = ranked[0] if ranked else None
    text = f"{request.subject}\n{request.body}".strip()
    processed = preprocess(text)
    message_at = request.message_at or datetime.now(UTC)
    instructions = extract_instructions(text)
    deadlines = extract_deadlines(
        text,
        message_at=message_at,
        timezone=request.timezone,
    )
    factors = request.priority_factors
    has_validated_deadline = any(not item.needs_review for item in deadlines)
    priority = calculate_priority(
        urgency=factors.get("urgency", 0.0),
        deadline=factors.get("deadline", 1.0 if has_validated_deadline else 0.0),
        sender=factors.get("sender", 0.0),
        calendar=factors.get("calendar", 0.5),
        dampener=factors.get("dampener", 1.0),
    )
    common = {
        "language": processed.language,
        "summary": summarize(text),
        "instructions": [
            {"source_text": item.source_text, "action": item.action, "confidence": item.confidence}
            for item in instructions
        ],
        "deadlines": [
            {
                "source_text": item.source_text,
                "due_date": item.due_date.isoformat() if item.due_date else None,
                "confidence": item.confidence,
                "needs_review": item.needs_review,
            }
            for item in deadlines
        ],
        "priority": {
            "level": priority.level.value,
            "score": priority.score,
            "factors": priority.factors,
            "weights": priority.weights,
            "dampener": priority.dampener,
        },
    }
    if winner is None or not bool(winner["meets_threshold"]):
        return ClassificationResponse(
            category_id=None,
            category_name=None,
            similarity=float(winner["similarity"]) if winner else 0.0,
            threshold=request.threshold,
            status="UNCATEGORIZED",
            ranked_matches=ranked,
            **common,
        )

    category = next(category for category in request.categories if category.id == winner["category_id"])
    return ClassificationResponse(
        category_id=category.id,
        category_name=category.name,
        similarity=float(winner["similarity"]),
        threshold=request.threshold,
        status="CLASSIFIED",
        ranked_matches=ranked,
        **common,
    )
