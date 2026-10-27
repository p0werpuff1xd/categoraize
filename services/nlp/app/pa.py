from dataclasses import dataclass
import json
from pathlib import Path

import numpy as np
from sklearn.linear_model import PassiveAggressiveClassifier

from .schemas import PassiveAggressiveOutput


@dataclass
class PAState:
    classes: list[str]
    coef: list[list[float]]
    intercept: list[float]
    trained_examples: int
    version: int


class PersonalClassifierStore:
    def __init__(self, model_dir: Path, min_examples: int):
        self.path = model_dir / "pa"
        self.path.mkdir(parents=True, exist_ok=True)
        self.min_examples = min_examples

    def predict(
        self, user_id: str, embedding: np.ndarray, model_version: str
    ) -> PassiveAggressiveOutput:
        state = self._load(user_id)
        if not state or state.trained_examples < self.min_examples:
            return PassiveAggressiveOutput(
                ready=False,
                model_version=model_version,
                trained_examples=state.trained_examples if state else 0,
            )
        classifier = self._classifier(state)
        return PassiveAggressiveOutput(
            ready=True,
            category=str(classifier.predict(embedding.reshape(1, -1))[0]),
            model_version=f"{model_version}:pa-{state.version}",
            trained_examples=state.trained_examples,
        )

    def predict_unavailable(
        self, user_id: str, model_version: str
    ) -> PassiveAggressiveOutput:
        state = self._load(user_id)
        return PassiveAggressiveOutput(
            ready=False,
            model_version=model_version,
            trained_examples=state.trained_examples if state else 0,
        )

    def update(
        self,
        user_id: str,
        embedding: np.ndarray,
        category: str,
        classes: list[str],
        model_version: str,
    ) -> PassiveAggressiveOutput:
        state = self._load(user_id)
        if state and state.classes != classes:
            raise ValueError("category set changed; start a new PA model version")
        state = state or PAState(classes, [], [], 0, 0)
        classifier = self._classifier(state) if state.coef else PassiveAggressiveClassifier(random_state=17)
        classifier.partial_fit(embedding.reshape(1, -1), [category], classes=np.array(classes))
        state = PAState(
            classes=classes,
            coef=classifier.coef_.tolist(),
            intercept=classifier.intercept_.tolist(),
            trained_examples=state.trained_examples + 1,
            version=state.version + 1,
        )
        self._save(user_id, state)
        return PassiveAggressiveOutput(
            ready=state.trained_examples >= self.min_examples,
            category=category if state.trained_examples >= self.min_examples else None,
            model_version=f"{model_version}:pa-{state.version}",
            trained_examples=state.trained_examples,
        )

    def _load(self, user_id: str) -> PAState | None:
        file = self.path / f"{user_id}.json"
        if not file.exists():
            return None
        return PAState(**json.loads(file.read_text(encoding="utf-8")))

    def _save(self, user_id: str, state: PAState) -> None:
        target = self.path / f"{user_id}.json"
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(state.__dict__), encoding="utf-8")
        temporary.replace(target)

    @staticmethod
    def _classifier(state: PAState) -> PassiveAggressiveClassifier:
        classifier = PassiveAggressiveClassifier(random_state=17)
        classifier.classes_ = np.array(state.classes)
        classifier.coef_ = np.array(state.coef)
        classifier.intercept_ = np.array(state.intercept)
        return classifier
