"""Sentence-BERT model lifecycle. The model loads once in a background thread
at startup; until it is ready, model-backed endpoints answer 503."""

import logging
import math
import os
import re
import threading
from collections.abc import Sequence
from typing import Literal, Protocol

MODEL_NAME = os.getenv("CATEGORAIZE_MODEL_NAME", "paraphrase-multilingual-MiniLM-L12-v2")
VECTOR_DIMENSION = 384
MAX_EMAIL_UNITS = 24

ModelStatus = Literal["loading", "ready", "error"]

logger = logging.getLogger(__name__)


class Encoder(Protocol):
    def encode(self, sentences: list[str], *, normalize_embeddings: bool) -> Sequence[Sequence[float]]: ...


class ModelManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._encoder: Encoder | None = None
        self.status: ModelStatus = "loading"
        self.error: str | None = None
        self._template_vectors: dict[str, list[float]] = {}

    def start_background_load(self) -> threading.Thread:
        thread = threading.Thread(target=self.load, name="sbert-loader", daemon=True)
        thread.start()
        return thread

    def load(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer

            encoder = SentenceTransformer(MODEL_NAME, device="cpu")
            self.use_encoder(encoder)
            logger.info("Sentence-BERT model %s ready", MODEL_NAME)
        except Exception as error:  # noqa: BLE001 - surfaced through /healthz
            logger.exception("Failed to load Sentence-BERT model")
            self.status = "error"
            self.error = str(error)

    def use_encoder(self, encoder: Encoder) -> None:
        from ..algorithms.label_library import LABEL_TEMPLATES

        with self._lock:
            self._encoder = encoder
            vectors = self._encode_locked([template.description for template in LABEL_TEMPLATES])
            self._template_vectors = {template.key: vector for template, vector in zip(LABEL_TEMPLATES, vectors)}
            self.status = "ready"
            self.error = None

    @property
    def ready(self) -> bool:
        return self.status == "ready"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        with self._lock:
            return self._encode_locked(list(texts))

    def embed_email(self, subject: str, body: str) -> list[float]:
        """Represent an email as the normalized mean of its subject and sentence
        embeddings, so one long sentence or a signature block does not dominate."""
        units = _email_units(subject, body)
        vectors = self.embed(units)
        mean = [sum(column) / len(vectors) for column in zip(*vectors)]
        norm = math.sqrt(sum(value * value for value in mean))
        if norm == 0:
            return vectors[0]
        return [value / norm for value in mean]

    def template_vectors(self) -> dict[str, list[float]]:
        return self._template_vectors

    def _encode_locked(self, texts: list[str]) -> list[list[float]]:
        if self._encoder is None:
            raise RuntimeError("model is not loaded")
        vectors = [list(map(float, vector)) for vector in self._encoder.encode(texts, normalize_embeddings=True)]
        if any(len(vector) != VECTOR_DIMENSION for vector in vectors):
            raise RuntimeError(f"embedding model returned a non-{VECTOR_DIMENSION} vector")
        return vectors


model_manager = ModelManager()


def _email_units(subject: str, body: str) -> list[str]:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", body) if len(part.strip()) > 1]
    units = [text for text in (subject.strip(), *sentences) if text][:MAX_EMAIL_UNITS]
    return units or [" "]
