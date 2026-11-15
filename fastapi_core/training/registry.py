"""Versioned tagger models: models/tagger/v1, v2, ... plus current.json."""

import json
from pathlib import Path

from .data import DATA_DIR, Example, load_jsonl, load_markup_dir, load_markup_file

MODELS_DIR = Path(__file__).resolve().parent.parent / "models" / "tagger"
HAND_LABELED_TEST = DATA_DIR / "test" / "hand_labeled.md"
PROVISIONAL_TEST = DATA_DIR / "test" / "provisional_claude.md"


def current_version() -> str | None:
    pointer = MODELS_DIR / "current.json"
    if not pointer.exists():
        return None
    return json.loads(pointer.read_text(encoding="utf-8"))["version"]


def set_current(version: str) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    (MODELS_DIR / "current.json").write_text(json.dumps({"version": version}) + "\n", encoding="utf-8")


def next_version() -> str:
    numbers = [int(path.name[1:]) for path in MODELS_DIR.glob("v*") if path.is_dir() and path.name[1:].isdigit()]
    return f"v{max(numbers, default=0) + 1}"


def load_test_set() -> tuple[list[Example], str]:
    """The user's hand-labeled set once it has emails; until then the provisional one."""
    if HAND_LABELED_TEST.exists():
        examples = load_markup_file(HAND_LABELED_TEST)
        if examples:
            return examples, HAND_LABELED_TEST.name
    return load_markup_file(PROVISIONAL_TEST), PROVISIONAL_TEST.name


def load_team_examples() -> list[Example]:
    """Team-written and hand-corrected examples (never real users' mail)."""
    return [*load_markup_dir(DATA_DIR / "team"), *load_markup_dir(DATA_DIR / "corrected")]


LLM_TRAIN = DATA_DIR / "llm" / "tagger.jsonl"
LLM_HOLDOUT = DATA_DIR / "llm" / "tagger_holdout.jsonl"


def load_llm_examples(holdout: bool = False) -> list[Example]:
    """LLM-written synthetic emails (training/llm_generate.py); the holdout slice is never trained on."""
    path = LLM_HOLDOUT if holdout else LLM_TRAIN
    return load_jsonl(path) if path.exists() else []
