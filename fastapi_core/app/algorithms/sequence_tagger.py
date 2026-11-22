"""Bi-LSTM-CRF sequence tagger for TASK and DATE spans (BIO tags).

Each token is represented by a word embedding (lowercased, digits folded to 0),
a character CNN over the raw characters (catches affixes such as paki-/i- and
Taglish spellings the word vocabulary has never seen) and a small casing
feature. A bidirectional LSTM reads the sentence and a CRF layer picks the
best tag sequence with Viterbi decoding, so tags stay well-formed.

Training happens offline (training/ scripts) on synthetic and team-written
text only. The service loads a fixed version at startup and never changes
weights while serving.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

import torch
from torch import nn
from torchcrf import CRF

from ..nlp.regex_tagger import RawSpan
from ..nlp.tokens import TAGS, bio_to_spans, split_sentences, tokenize

PAD, UNK = "<pad>", "<unk>"
CASING = ("lower", "title", "upper", "other")


@dataclass(frozen=True)
class TaggerConfig:
    word_dim: int = 100
    char_dim: int = 30
    char_filters: int = 50
    casing_dim: int = 4
    hidden: int = 128
    dropout: float = 0.5
    max_word_chars: int = 24


class BiLstmCrf(nn.Module):
    def __init__(self, word_vocab_size: int, char_vocab_size: int, config: TaggerConfig) -> None:
        super().__init__()
        self.config = config
        self.word_embedding = nn.Embedding(word_vocab_size, config.word_dim, padding_idx=0)
        self.char_embedding = nn.Embedding(char_vocab_size, config.char_dim, padding_idx=0)
        self.char_cnn = nn.Conv1d(config.char_dim, config.char_filters, kernel_size=3, padding=1)
        self.casing_embedding = nn.Embedding(len(CASING), config.casing_dim)
        self.dropout = nn.Dropout(config.dropout)
        self.lstm = nn.LSTM(
            config.word_dim + config.char_filters + config.casing_dim,
            config.hidden // 2,
            batch_first=True,
            bidirectional=True,
        )
        self.emissions = nn.Linear(config.hidden, len(TAGS))
        self.crf = CRF(len(TAGS), batch_first=True)

    def _emissions(self, words: torch.Tensor, chars: torch.Tensor, casing: torch.Tensor) -> torch.Tensor:
        batch, length, word_chars = chars.shape
        char_vectors = self.char_embedding(chars.view(batch * length, word_chars)).transpose(1, 2)
        char_features = torch.relu(self.char_cnn(char_vectors)).max(dim=2).values.view(batch, length, -1)
        features = torch.cat(
            [self.word_embedding(words), char_features, self.casing_embedding(casing)], dim=-1
        )
        hidden, _ = self.lstm(self.dropout(features))
        return self.emissions(self.dropout(hidden))

    def loss(self, words, chars, casing, mask, tags) -> torch.Tensor:
        return -self.crf(self._emissions(words, chars, casing), tags, mask=mask, reduction="mean")

    def decode(self, words, chars, casing, mask) -> list[list[int]]:
        return self.crf.decode(self._emissions(words, chars, casing), mask=mask)


@dataclass
class Vocab:
    words: dict[str, int]
    chars: dict[str, int]

    @classmethod
    def build(cls, sentences: list[list[str]], min_word_count: int = 1) -> "Vocab":
        word_counts: dict[str, int] = {}
        chars = {PAD: 0, UNK: 1}
        for sentence in sentences:
            for token in sentence:
                key = word_key(token)
                word_counts[key] = word_counts.get(key, 0) + 1
                for char in token:
                    chars.setdefault(char, len(chars))
        words = {PAD: 0, UNK: 1}
        for word, count in sorted(word_counts.items()):
            if count >= min_word_count:
                words[word] = len(words)
        return cls(words, chars)


def word_key(token: str) -> str:
    return re.sub(r"\d", "0", token.casefold())


def casing_of(token: str) -> int:
    if token.islower():
        return CASING.index("lower")
    if token.isupper() and len(token) > 1:
        return CASING.index("upper")
    if token[:1].isupper():
        return CASING.index("title")
    return CASING.index("other")


def encode_batch(
    sentences: list[list[str]], vocab: Vocab, config: TaggerConfig, word_dropout: float = 0.0
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    """Pad a batch of token lists into word, char, casing and mask tensors."""
    length = max(len(sentence) for sentence in sentences)
    words = torch.zeros(len(sentences), length, dtype=torch.long)
    chars = torch.zeros(len(sentences), length, config.max_word_chars, dtype=torch.long)
    casing = torch.zeros(len(sentences), length, dtype=torch.long)
    mask = torch.zeros(len(sentences), length, dtype=torch.bool)
    for row, sentence in enumerate(sentences):
        for col, token in enumerate(sentence):
            word_id = vocab.words.get(word_key(token), 1)
            # Word dropout teaches the model to lean on characters for unseen words.
            if word_dropout and torch.rand(1).item() < word_dropout:
                word_id = 1
            words[row, col] = word_id
            for position, char in enumerate(token[: config.max_word_chars]):
                chars[row, col, position] = vocab.chars.get(char, 1)
            casing[row, col] = casing_of(token)
            mask[row, col] = True
    return words, chars, casing, mask


def save_model(directory: Path, model: BiLstmCrf, vocab: Vocab, extra: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), directory / "model.pt")
    (directory / "config.json").write_text(
        json.dumps(
            {"config": model.config.__dict__, "words": vocab.words, "chars": vocab.chars, "tags": list(TAGS), **extra},
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )


def load_model(directory: Path) -> tuple[BiLstmCrf, Vocab, dict]:
    meta = json.loads((directory / "config.json").read_text(encoding="utf-8"))
    if meta["tags"] != list(TAGS):
        raise ValueError(f"tag set mismatch in {directory}")
    config = TaggerConfig(**meta["config"])
    vocab = Vocab(meta["words"], meta["chars"])
    model = BiLstmCrf(len(vocab.words), len(vocab.chars), config)
    model.load_state_dict(torch.load(directory / "model.pt", map_location="cpu", weights_only=True))
    model.eval()
    return model, vocab, meta


class SequenceTagger:
    """Serving wrapper: text in, RawSpan list out (same shape as the regex baseline)."""

    def __init__(self, model: BiLstmCrf, vocab: Vocab, version: str) -> None:
        self.model = model
        self.vocab = vocab
        self.version = version

    @classmethod
    def from_directory(cls, directory: Path) -> "SequenceTagger":
        model, vocab, meta = load_model(directory)
        return cls(model, vocab, str(meta.get("version", directory.name)))

    def predict_tags(self, token_lists: list[list[str]]) -> list[list[str]]:
        if not token_lists:
            return []
        with torch.inference_mode():
            words, chars, casing, mask = encode_batch(token_lists, self.vocab, self.model.config)
            paths = self.model.decode(words, chars, casing, mask)
        return [[TAGS[index] for index in path] for path in paths]

    def tag(self, text: str) -> list[RawSpan]:
        tokens = tokenize(text)
        sentences = [sentence for sentence in split_sentences(text, tokens) if sentence]
        tags = self.predict_tags([[token.text for token in sentence] for sentence in sentences])
        spans: list[RawSpan] = []
        for sentence, sentence_tags in zip(sentences, tags, strict=True):
            for span in bio_to_spans(sentence, sentence_tags):
                spans.append(RawSpan(span.label, text[span.start : span.end], span.start, span.end))  # type: ignore[arg-type]
        return sorted(spans, key=lambda span: (span.start, span.label))
