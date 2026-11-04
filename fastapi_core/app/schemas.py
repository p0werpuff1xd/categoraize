from pydantic import BaseModel, Field

from datetime import datetime


class CategoryVector(BaseModel):
    id: str
    name: str
    vector: list[float] = Field(min_length=1)


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=64)


class EmbeddingResponse(BaseModel):
    model: str
    dimension: int
    embeddings: list[list[float]]


class FeedbackRequest(BaseModel):
    email_vector: list[float] = Field(min_length=1)
    correct_centroid: list[float] = Field(min_length=1)
    incorrect_centroid: list[float] | None = None
    alpha: float = Field(default=0.20, ge=0.0, le=1.0)
    beta: float = Field(default=0.15, ge=0.0, le=1.0)


class FeedbackResponse(BaseModel):
    correct_centroid: list[float]
    incorrect_centroid: list[float] | None
    alpha: float
    beta: float


class ClassificationRequest(BaseModel):
    email_vector: list[float] = Field(min_length=1)
    categories: list[CategoryVector]
    threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    subject: str = ""
    body: str = ""
    message_at: datetime | None = None
    timezone: str = "UTC"
    priority_factors: dict[str, float] = Field(default_factory=dict)


class ClassificationResponse(BaseModel):
    category_id: str | None
    category_name: str | None
    similarity: float
    threshold: float
    status: str
    ranked_matches: list[dict[str, float | str | bool]]
    language: str
    summary: list[str]
    instructions: list[dict[str, str | float]]
    deadlines: list[dict[str, str | float | bool | None]]
    priority: dict[str, object]
