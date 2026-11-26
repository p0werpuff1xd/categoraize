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
    # Search queries: Filipino/Taglish text is embedded as its English gloss
    # (Taglish dictionary); English text is embedded as is.
    gloss: bool = False


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
    # Canonical template key (e.g. "promotions") when the category is one of the
    # curated templates; user-named categories leave this null.
    slug: str | None = Field(default=None, max_length=64)


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
    # A category the user already chose for this email: it stays the category and
    # supplies the priority base, while ranking is still reported.
    pinned_category_id: str | None = Field(default=None, max_length=200)
    # IAS Phase 11 J: false only for a user who turned PII masking off.
    mask_pii: bool = True
    # Mean embedding of the user's own mail. When given, labels are compared
    # mean-centred, cos(e - b, c - b): what all email shares is removed, so a
    # label taught by example competes fairly with description-only labels
    # instead of pulling in most of the inbox. threshold is then on that scale.
    background: Vector | None = None

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


class LearnedPriorityReason(BaseModel):
    factor: str
    contribution: float


class LearnedPriority(BaseModel):
    """Learned model level, then the user's category offset, then the guardrails."""

    level: int
    model_level: int
    category_offset: int
    why: list[LearnedPriorityReason]
    guardrails: list[str]


class SenderRegister(BaseModel):
    value: Literal["formal", "neutral", "casual"]
    source: Literal["learned", "rules"]


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
    # Counts only ({phone, card, gov_id}); the masked values are never returned.
    pii_masked: dict[str, int] = Field(default_factory=dict)
    # None when no learned priority model is loaded (the rule priority above still applies).
    learned_priority: LearnedPriority | None = None
    sender_register: SenderRegister | None = None


class MatchCandidate(StrictModel):
    id: CategoryId
    text: str = Field(default="", max_length=2_000)
    centroid: Vector | None = None

    @field_validator("text")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class MatchRequest(StrictModel):
    """Zero-shot match of one email (or sender) against free-text descriptions.

    Used for rule matching, cold-email detection and sender categories. A
    candidate with a learned centroid uses it; otherwise its text is embedded.
    """

    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=50_000)
    candidates: list[MatchCandidate] = Field(min_length=1, max_length=200)
    threshold: float = Field(default=0.35, ge=-1.0, le=1.0)

    @field_validator("candidates")
    @classmethod
    def _candidates_have_content(cls, value: list[MatchCandidate]) -> list[MatchCandidate]:
        for candidate in value:
            if not candidate.text and candidate.centroid is None:
                raise ValueError(f"candidate {candidate.id} needs text or a centroid")
        if len({candidate.id for candidate in value}) != len(value):
            raise ValueError("candidate ids must be unique")
        return value


class MatchResponse(BaseModel):
    ranked: list[CategoryMatch]
    best: CategoryMatch | None
    threshold: float
    embedding: list[float]
    # The TASK/DATE tagger found a request in the subject or body.
    has_task: bool
    timings_ms: dict[str, float]


class RuleCandidate(StrictModel):
    id: CategoryId
    name: str = Field(min_length=1, max_length=200)
    instructions: str = Field(default="", max_length=4_000)
    # The rule that means "someone needs my reply" (To Reply / Conversations).
    reply_needed: bool = False
    # Built-in rule kind (NEWSLETTER, RECEIPT, ...); adds bilingual descriptions.
    system_type: str | None = Field(default=None, max_length=64)


class ChooseRuleRequest(StrictModel):
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=50_000)
    rules: list[RuleCandidate] = Field(min_length=1, max_length=100)
    allow_multiple: bool = False


class ChooseRuleResponse(BaseModel):
    ranked: list[CategoryMatch]
    matched: list[str]
    confident: bool
    reasons: list[str]
    has_request: bool
    params: dict[str, float]


class ThreadMessageInput(StrictModel):
    from_user: bool
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=20_000)
    automated: bool = False


class ThreadStatusRequest(StrictModel):
    messages: list[ThreadMessageInput] = Field(min_length=1, max_length=30)


class ThreadStatusResponse(BaseModel):
    status: Literal["TO_REPLY", "AWAITING_REPLY", "FYI", "ACTIONED"]
    confident: bool
    reason: str
    signals: dict[str, bool]


class SummarizeRequest(StrictModel):
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(max_length=50_000)
    max_sentences: int = Field(default=2, ge=1, le=5)


class SummarizeResponse(BaseModel):
    sentences: list[str]
    method: Literal["sbert_centroid"] = "sbert_centroid"


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


class VectorItem(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    vector: Vector


class DiscoverRequest(StrictModel):
    vectors: list[VectorItem] = Field(min_length=2, max_length=10_000)
    min_cluster_size: int = Field(default=3, ge=2, le=100)


class ClusterResult(BaseModel):
    cluster_id: int
    member_ids: list[str]
    centroid: list[float]
    cohesion: float


class DiscoverResponse(BaseModel):
    clusters: list[ClusterResult]
    noise_ids: list[str]


class _EmailText(StrictModel):
    subject: str = Field(default="", max_length=2_000)
    body: str = Field(default="", max_length=50_000)
    mask_pii: bool = True


class _TimedEmail(_EmailText):
    received_at: AwareDatetime
    timezone: str = "Asia/Manila"

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError(f"unknown timezone: {value}") from error
        return value


class TasksRequest(_TimedEmail):
    # None means no calendar data: no conflict is reported and nothing is lowered.
    calendar_busy: list[BusyPeriod] | None = Field(default=None, max_length=500)


class TaskSpan(BaseModel):
    label: Literal["TASK", "DATE"]
    text: str
    source: Literal["subject", "body"]
    start: int
    end: int
    # ISO date ("2026-11-19") when no time was stated, ISO datetime otherwise.
    resolved: str | None = None
    ambiguous: bool = False


class TasksResponse(BaseModel):
    spans: list[TaskSpan]
    calendar_checked: bool
    calendar_conflict: bool
    tagger: dict


class RegisterRequest(_EmailText):
    pass


class RegisterResponse(BaseModel):
    tone: Literal["formal", "neutral", "casual"] = Field(alias="register")
    source: Literal["learned", "rules"]
    probabilities: dict[str, float] | None
    cues: dict[str, float]


class PriorityRequest(_TimedEmail):
    sender: Sender = Field(default_factory=Sender)
    # Rule fallback base and the promotion cap; the web app knows the category.
    category_base_priority: int = Field(default=3, ge=1, le=5)
    is_promotion: bool = False
    calendar_busy: list[BusyPeriod] | None = Field(default=None, max_length=500)
    # A level the user set by hand; it always wins.
    override_priority: int | None = Field(default=None, ge=1, le=5)


class PriorityReason(BaseModel):
    factor: str
    contribution: float


class PriorityResponse(BaseModel):
    level: int
    source: Literal["learned", "rules"]
    why: list[PriorityReason]
    guardrails: list[str]
    tone: Literal["formal", "neutral", "casual"] = Field(alias="register")
    has_task: bool
    deadline_proximity: float
