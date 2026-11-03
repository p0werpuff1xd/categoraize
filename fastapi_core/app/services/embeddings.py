from collections.abc import Sequence
from functools import lru_cache

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
VECTOR_DIMENSION = 384


@lru_cache(maxsize=1)
def _load_model():
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as error:
        raise RuntimeError(
            "sentence-transformers is required for embedding inference"
        ) from error
    return SentenceTransformer(MODEL_NAME)


def embed_texts(texts: Sequence[str]) -> list[list[float]]:
    if not texts:
        return []

    vectors = _load_model().encode(list(texts), normalize_embeddings=True)
    result = [list(map(float, vector)) for vector in vectors]
    if any(len(vector) != VECTOR_DIMENSION for vector in result):
        raise RuntimeError(f"embedding model returned a non-{VECTOR_DIMENSION} vector")
    return result
