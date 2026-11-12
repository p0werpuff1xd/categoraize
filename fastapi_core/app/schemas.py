import math
from datetime import datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from .services.embeddings import VECTOR_DIMENSION


def _finite(vector: list[float]) -> list[float]:
    if not all(math.isfinite(value) for value in vector):
        raise ValueError("vector values must be finite numbers")
    return vector


Vector = Annotated[
    list[float],
    Field(min_length=VECTOR_DIMENSION, max_length=VECTOR_DIMENSION),
    AfterValidator(_finite),
]
CategoryId = Annotated[str, Field(min_length=1, max_length=200)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmbedRequest(StrictModel):
    texts: list[Annotated[str, Field(max_length=20_000)]] = Field(min_length=1, max_length=64)


class EmbedResponse(BaseModel):
    model: str
    dimension: int
    vectors: list[list[float]]


class Sender(StrictModel):
    email: str = Field(default="", max_length=320)
    role: str | None = Field(default=None, max_length=64)
    is_vip: bool = False


class CategoryInput(StrictModel):
    id: CategoryId
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2_000)
    base_priority: int = Field(default=3, ge=1, le=5)
    centroid: Vector | None = None


class BusyPeriod(StrictModel):
    start: AwareDatetime
    end: AwareDatetime


class ClassifyRequest(StrictModel):
    email_id: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=50_000)
    received_at: AwareDatetime
    timezone: str = "UTC"
    sender: Sender = Field(default_factory=Sender)
    categories: list[CategoryInput] = Field(default_factory=list, max_length=200)
    threshold: float = Field(default=0.35, ge=-1.0, le=1.0)
    calendar_busy: list[BusyPeriod] | None = None
    confirmed_deadlines: list[AwareDatetime] = Field(default_factory=list, max_length=20)
    now: AwareDatetime | None = None
    uncategorized_base_priority: int = Field(default=3, ge=1, le=5)

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"unknown timezone: {value}") from error
        return value


class CategoryMatch(BaseModel):
    id: str
    similarity: float


class SuggestedLabel(BaseModel):
    key: str
    name: str
    description: str
    similarity: float


class Span(BaseModel):
    label: Literal["TASK", "DATE"]
    text: str
    source: Literal["subject", "body"]
    start: int
    end: int
    resolved: datetime | None = None
    ambiguous: bool = False
    is_deadline: bool = False
    tagger: Literal["regex", "bilstm_crf"] = "regex"


class PriorityFactors(BaseModel):
    category_base: int
    deadline: int
    sender_role: int
    calendar: int
    vip_pin: int


class Priority(BaseModel):
    level: int
    factors: PriorityFactors
    deadline: datetime | None


class ClassifyResponse(BaseModel):
    email_id: str
    language: Literal["en", "tl", "mixed", "unknown"]
    category: CategoryMatch | None
    ranked: list[CategoryMatch]
    threshold: float
    suggested_label: SuggestedLabel | None
    spans: list[Span]
    priority: Priority
    embedding: list[float]
    timings_ms: dict[str, float]


class CentroidInput(StrictModel):
    id: CategoryId
    centroid: Vector


class FeedbackRequest(StrictModel):
    embedding: Vector
    correct: CentroidInput
    incorrect: CentroidInput | None = None
    alpha: float = Field(default=0.20, gt=0.0, le=1.0)
    beta: float = Field(default=0.15, ge=0.0, le=1.0)


class CentroidOutput(BaseModel):
    id: str
    centroid: list[float]


class FeedbackResponse(BaseModel):
    correct: CentroidOutput
    incorrect: CentroidOutput | None
    alpha: float
    beta: float
