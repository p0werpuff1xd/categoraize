"""Load labeled examples (markup) and turn them into per-sentence BIO data.

Allowed sources are only the files under fastapi_core/data: generated
synthetic emails, team-written examples and hand-labeled test emails. Real
users' mailbox content must never be placed there (Google API Limited Use).
"""

import json
from dataclasses import dataclass
from pathlib import Path

from app.nlp.tokens import CharSpan, Token, parse_markup, spans_to_bio, split_sentences, tokenize

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass
class Example:
    text: str
    spans: list[CharSpan]
    lang: str
    source: str


@dataclass
class Sentence:
    tokens: list[Token]
    tags: list[str]
    lang: str


def load_markup_file(path: Path) -> list[Example]:
    """Blocks separated by a line '---'. '# lang: tl' sets the block language; other '#' lines are comments."""
    _require_inside_data_dir(path)
    examples: list[Example] = []
    for number, block in enumerate(path.read_text(encoding="utf-8").split("\n---")):
        lang = "unknown"
        lines: list[str] = []
        for line in block.strip("\n-").splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                if stripped.casefold().startswith("# lang:"):
                    lang = stripped.split(":", 1)[1].strip().casefold()
                continue
            lines.append(line)
        marked = "\n".join(lines).strip()
        if not marked:
            continue
        try:
            text, spans = parse_markup(marked)
        except ValueError as error:
            raise ValueError(f"{path.name} block {number + 1}: {error}") from error
        examples.append(Example(text, spans, lang, f"{path.name}#{number + 1}"))
    return examples


def load_markup_dir(directory: Path) -> list[Example]:
    if not directory.exists():
        return []
    return [example for path in sorted(directory.glob("*.md")) if path.name != "README.md"
            for example in load_markup_file(path)]


def load_jsonl(path: Path) -> list[Example]:
    _require_inside_data_dir(path)
    examples = []
    for index, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
        row = json.loads(line)
        text, spans = parse_markup(row["markup"])
        examples.append(Example(text, spans, row.get("lang", "unknown"), f"{path.name}#{index + 1}"))
    return examples


def to_sentences(examples: list[Example]) -> list[Sentence]:
    sentences: list[Sentence] = []
    for example in examples:
        tokens = tokenize(example.text)
        tags = spans_to_bio(tokens, example.spans)
        tag_by_start = {token.start: tag for token, tag in zip(tokens, tags, strict=True)}
        for sentence in split_sentences(example.text, tokens):
            sentences.append(Sentence(sentence, [tag_by_start[token.start] for token in sentence], example.lang))
    return sentences


def _require_inside_data_dir(path: Path) -> None:
    if DATA_DIR not in path.resolve().parents:
        raise ValueError(f"training data must live under {DATA_DIR}, got {path}")
