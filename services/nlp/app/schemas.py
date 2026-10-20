from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CategoryDescription(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)


class AnalyzeRequest(BaseModel):
    email_id: str = Field(min_length=1, max_length=255)
    subject: str = Field(default="", max_length=2000)
    body: str = Field(default="", max_length=50000)
    category_descriptions: list[CategoryDescription] = Field(min_length=1, max_length=100)
    message_date: datetime | None = None

    @model_validator(mode="after")
    def require_readable_content(self) -> "AnalyzeRequest":
        if not (self.subject.strip() or self.body.strip()):
            raise ValueError("subject or body is required")
        if len({category.name for category in self.category_descriptions}) != len(
            self.category_descriptions
        ):
            raise ValueError("category names must be unique")
        return self


class FeedbackRequest(BaseModel):
    email_id: str = Field(min_length=1, max_length=255)
    corrected_category: str = Field(min_length=1, max_length=120)


class Score(BaseModel):
    category: str
    score: float


class SbertOutput(BaseModel):
    status: Literal["ready", "unavailable"]
    category: str | None = None
    scores: list[Score] = Field(default_factory=list)
    model_version: str


class PassiveAggressiveOutput(BaseModel):
    ready: bool
    category: str | None = None
    model_version: str
    trained_examples: int = 0


class Entity(BaseModel):
    text: str
    label: Literal["ACTION", "DEADLINE"]
    start: int
    end: int
    confidence: float | None = None


class BilstmCrfOutput(BaseModel):
    status: Literal["ready", "unavailable"]
    entities: list[Entity] = Field(default_factory=list)
    model_version: str


class PriorityOutput(BaseModel):
    level: Literal["high", "normal", "low"]
    explanation: list[str]


class AnalyzeResponse(BaseModel):
    email_id: str
    sbert: SbertOutput
    passive_aggressive: PassiveAggressiveOutput
    bilstm_crf: BilstmCrfOutput
    final_category: str | None
    priority: PriorityOutput
    errors: list[str] = Field(default_factory=list)


class FeedbackResponse(BaseModel):
    email_id: str
    corrected_category: str
    pa_model_version: str
    trained_examples: int
