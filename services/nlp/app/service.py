from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .bilstm_crf import BilstmCrfTagger
from .config import Settings
from .pa import PersonalClassifierStore
from .preprocessing import sanitize_text
from .priority import resolve_priority
from .schemas import AnalyzeRequest, AnalyzeResponse, FeedbackResponse
from .sbert import SemanticClassifier


@dataclass
class StoredAnalysis:
    text: str
    embedding: np.ndarray
    categories: list[str]


class AnalysisService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.sbert = SemanticClassifier(settings.sbert_model)
        self.pa = PersonalClassifierStore(settings.model_dir, settings.pa_min_examples)
        self.ner = BilstmCrfTagger(settings.model_dir / "bilstm-crf.pt")
        self.analyses: dict[tuple[str, str], StoredAnalysis] = {}

    def analyze(self, user_id: str, request: AnalyzeRequest) -> AnalyzeResponse:
        text = sanitize_text(request.subject, request.body, self.settings)
        (sbert, embedding_or_error), sbert_error = self.sbert.classify(
            text, request.category_descriptions
        )
        errors: list[str] = []
        embedding = embedding_or_error if isinstance(embedding_or_error, np.ndarray) else None
        if sbert_error:
            errors.append("sbert unavailable: model could not be loaded")
        pa_version = sbert.model_version
        pa = (
            self.pa.predict(user_id, embedding, pa_version)
            if embedding is not None
            else self.pa.predict_unavailable(user_id, pa_version)
        )
        ner = self.ner.tag(text)
        if ner.status == "unavailable":
            errors.append("bilstm-crf unavailable: no valid trained checkpoint")
        final_category = pa.category if pa.ready else sbert.category
        self.analyses[(user_id, request.email_id)] = StoredAnalysis(
            text=text,
            embedding=embedding if embedding is not None else np.array([]),
            categories=[category.name for category in request.category_descriptions],
        )
        return AnalyzeResponse(
            email_id=request.email_id,
            sbert=sbert,
            passive_aggressive=pa,
            bilstm_crf=ner,
            final_category=final_category,
            priority=resolve_priority(text, ner.entities),
            errors=errors,
        )

    def feedback(self, user_id: str, request_email_id: str, category: str) -> FeedbackResponse:
        stored = self.analyses.get((user_id, request_email_id))
        if not stored or stored.embedding.size == 0:
            raise ValueError("analyze this email successfully before submitting feedback")
        if category not in stored.categories:
            raise ValueError("corrected category is not present in the analysis categories")
        output = self.pa.update(
            user_id,
            stored.embedding,
            category,
            stored.categories,
            self.sbert.model_version,
        )
        return FeedbackResponse(
            email_id=request_email_id,
            corrected_category=category,
            pa_model_version=output.model_version,
            trained_examples=output.trained_examples,
        )
