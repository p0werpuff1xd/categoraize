"""Picks the span tagger: the trained Bi-LSTM-CRF when present, else the regex baseline.

The model version is read once from models/tagger/current.json. A newly
promoted version is only used after a restart; weights never change while
serving.
"""

import json
import logging
import os
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from ..algorithms.sequence_tagger import SequenceTagger
from ..nlp.regex_tagger import RawSpan
from ..nlp.regex_tagger import tag as regex_tag

logger = logging.getLogger(__name__)

DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models" / "tagger"
TaggerName = Literal["regex", "bilstm_crf"]


class TaggerManager:
    def __init__(self) -> None:
        self._tagger: SequenceTagger | None = None
        self._loaded = False
        self.error: str | None = None

    def _load(self) -> None:
        self._loaded = True
        if os.getenv("CATEGORAIZE_TAGGER", "bilstm_crf") == "regex":
            return
        models_dir = Path(os.getenv("CATEGORAIZE_TAGGER_DIR", DEFAULT_MODELS_DIR))
        try:
            version = json.loads((models_dir / "current.json").read_text(encoding="utf-8"))["version"]
            self._tagger = SequenceTagger.from_directory(models_dir / version)
        except FileNotFoundError:
            self.error = f"no trained tagger in {models_dir}; using the regex baseline"
            logger.warning(self.error)
        except Exception as error:  # a broken model must not take the service down
            self.error = f"tagger failed to load ({error}); using the regex baseline"
            logger.exception(self.error)

    def active(self) -> tuple[TaggerName, Callable[[str], list[RawSpan]], str | None]:
        if not self._loaded:
            self._load()
        if self._tagger is not None:
            return "bilstm_crf", self._tagger.tag, self._tagger.version
        return "regex", regex_tag, None

    def describe(self) -> dict:
        name, _, version = self.active()
        return {"name": name, "version": version, "error": self.error}

    def reset(self) -> None:
        """Tests only: forget the loaded tagger so env changes take effect."""
        self._tagger, self._loaded, self.error = None, False, None


tagger_manager = TaggerManager()
