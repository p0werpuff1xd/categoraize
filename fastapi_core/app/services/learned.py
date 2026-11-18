"""Loads the learned register and priority models once at startup.

Each kind is read from models/<kind>/current.json -> <version>/model.json.
A missing or broken file is not an error for the service: the endpoints fall
back to the rule baselines and /healthz reports why.
"""

import json
import logging
import os
from pathlib import Path

from ..ml.linear import LinearModel

logger = logging.getLogger(__name__)
DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
KINDS = ("register", "priority")


class LearnedModels:
    def __init__(self) -> None:
        self._models: dict[str, LinearModel | None] = {}
        self._versions: dict[str, str | None] = {}
        self._errors: dict[str, str | None] = {}
        self._loaded = False

    def load(self) -> None:
        models_dir = Path(os.getenv("CATEGORAIZE_MODELS_DIR", DEFAULT_MODELS_DIR))
        for kind in KINDS:
            self._models[kind], self._versions[kind], self._errors[kind] = None, None, None
            try:
                version = json.loads((models_dir / kind / "current.json").read_text(encoding="utf-8"))["version"]
                self._models[kind] = LinearModel.load(models_dir / kind / version / "model.json")
                self._versions[kind] = version
            except FileNotFoundError:
                self._errors[kind] = f"no {kind} model; using rules"
            except Exception as error:  # a broken file must not take the service down
                self._errors[kind] = f"{kind} model failed to load ({type(error).__name__}); using rules"
                logger.exception(self._errors[kind])
        self._loaded = True

    def get(self, kind: str) -> LinearModel | None:
        if not self._loaded:
            self.load()
        return self._models.get(kind)

    def describe(self) -> dict:
        if not self._loaded:
            self.load()
        return {kind: {"version": self._versions[kind], "error": self._errors[kind]} for kind in KINDS}

    def reset(self) -> None:
        """Tests only."""
        self._models, self._versions, self._errors, self._loaded = {}, {}, {}, False


learned_models = LearnedModels()
