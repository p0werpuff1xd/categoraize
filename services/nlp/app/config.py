from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    service_token: str | None
    model_dir: Path
    sbert_model: str
    max_text_chars: int
    pa_min_examples: int


def load_settings() -> Settings:
    return Settings(
        service_token=os.getenv("NLP_SERVICE_TOKEN"),
        model_dir=Path(os.getenv("NLP_MODEL_DIR", "./models")),
        sbert_model=os.getenv(
            "SBERT_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        ),
        max_text_chars=int(os.getenv("NLP_MAX_TEXT_CHARS", "12000")),
        pa_min_examples=int(os.getenv("PA_MIN_EXAMPLES", "2")),
    )
