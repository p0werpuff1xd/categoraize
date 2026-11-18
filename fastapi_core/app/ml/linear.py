"""Multinomial logistic regression stored as plain JSON.

Coefficients stay inspectable and loading needs no pickle, so a model file
cannot execute code. Training happens offline with scikit-learn
(eval/train_models.py); serving only needs a dot product.
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class LinearModel:
    classes: list
    feature_names: list[str]
    coef: list[list[float]]  # one row per class
    intercept: list[float]
    meta: dict

    @classmethod
    def load(cls, path: Path) -> "LinearModel":
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(data["classes"], data["feature_names"], data["coef"], data["intercept"], data.get("meta", {}))

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        body = {"classes": self.classes, "feature_names": self.feature_names, "coef": self.coef,
                "intercept": self.intercept, "meta": self.meta}
        path.write_text(json.dumps(body, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    def scores(self, features: list[float]) -> list[float]:
        if len(features) != len(self.feature_names):
            raise ValueError(f"expected {len(self.feature_names)} features, got {len(features)}")
        return [sum(w * x for w, x in zip(row, features, strict=True)) + b
                for row, b in zip(self.coef, self.intercept, strict=True)]

    def predict_proba(self, features: list[float]) -> list[float]:
        scores = self.scores(features)
        top = max(scores)
        exps = [math.exp(score - top) for score in scores]
        total = sum(exps)
        return [value / total for value in exps]

    def predict(self, features: list[float]):
        probabilities = self.predict_proba(features)
        return self.classes[max(range(len(probabilities)), key=probabilities.__getitem__)]

    def contributions(self, features: list[float], class_index: int) -> list[float]:
        """Per-feature push toward class_index relative to the average class."""
        count = len(self.classes)
        return [x * (self.coef[class_index][i] - sum(row[i] for row in self.coef) / count)
                for i, x in enumerate(features)]
