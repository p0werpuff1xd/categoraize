from dataclasses import dataclass
from functools import cached_property

import numpy as np

from .schemas import CategoryDescription, Score, SbertOutput


@dataclass
class SemanticClassifier:
    model_name: str

    @cached_property
    def model(self):
        from sentence_transformers import SentenceTransformer

        return SentenceTransformer(self.model_name)

    @property
    def model_version(self) -> str:
        return f"sbert:{self.model_name}"

    def classify(
        self, text: str, categories: list[CategoryDescription]
    ) -> tuple[SbertOutput, np.ndarray | str | None]:
        try:
            embeddings = self.model.encode(
                [text, *[category.description for category in categories]],
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
        except Exception as error:
            return (
                SbertOutput(
                    status="unavailable", model_version=self.model_version
                ),
                None,
            ), str(error)

        scores = embeddings[1:] @ embeddings[0]
        ranked = sorted(
            (
                Score(category=category.name, score=float(score))
                for category, score in zip(categories, scores, strict=True)
            ),
            key=lambda item: item.score,
            reverse=True,
        )
        return (
            SbertOutput(
                status="ready",
                category=ranked[0].category,
                scores=ranked,
                model_version=self.model_version,
            ),
            embeddings[0],
        ), None
