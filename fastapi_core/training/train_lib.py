"""Offline training loop for the Bi-LSTM-CRF tagger (CPU)."""

import random
import time
from collections.abc import Callable

import torch

from app.algorithms.sequence_tagger import BiLstmCrf, SequenceTagger, TaggerConfig, Vocab, encode_batch
from app.nlp.tokens import TAG_INDEX, CharSpan

from .data import Example, Sentence, to_sentences
from .evaluation import evaluate


def train_tagger(
    train_examples: list[Example],
    dev_examples: list[Example],
    *,
    config: TaggerConfig | None = None,
    epochs: int = 12,
    batch_size: int = 32,
    learning_rate: float = 2e-3,
    word_dropout: float = 0.05,
    seed: int = 13,
    log: Callable[[str], None] = print,
) -> tuple[SequenceTagger, list[dict]]:
    """Train and keep the epoch with the best dev entity F1."""
    config = config or TaggerConfig()
    random.seed(seed)
    torch.manual_seed(seed)

    sentences = to_sentences(train_examples)
    vocab = Vocab.build([[token.text for token in sentence.tokens] for sentence in sentences])
    model = BiLstmCrf(len(vocab.words), len(vocab.chars), config)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    tagger = SequenceTagger(model, vocab, version="training")

    best_f1, best_state, history = -1.0, None, []
    for epoch in range(1, epochs + 1):
        started = time.perf_counter()
        model.train()
        random.shuffle(sentences)
        total_loss = 0.0
        for batch in _batches(sentences, batch_size):
            words, chars, casing, mask = encode_batch(
                [[token.text for token in sentence.tokens] for sentence in batch], vocab, config, word_dropout
            )
            tags = torch.zeros_like(words)
            for row, sentence in enumerate(batch):
                tags[row, : len(sentence.tags)] = torch.tensor([TAG_INDEX[tag] for tag in sentence.tags])
            optimizer.zero_grad()
            loss = model.loss(words, chars, casing, mask, tags)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            optimizer.step()
            total_loss += loss.item() * len(batch)

        model.eval()
        dev = evaluate(dev_examples, predictor(tagger))["overall"]["entity"]["micro"]["f1"]
        history.append({"epoch": epoch, "loss": round(total_loss / len(sentences), 4), "dev_entity_f1": dev,
                        "seconds": round(time.perf_counter() - started, 1)})
        log(f"epoch {epoch:>2}  loss {history[-1]['loss']:.4f}  dev entity F1 {dev:.4f}  ({history[-1]['seconds']}s)")
        if dev > best_f1:
            best_f1 = dev
            best_state = {key: value.clone() for key, value in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    model.eval()
    return tagger, history


def predictor(tagger: SequenceTagger) -> Callable[[str], list[CharSpan]]:
    return lambda text: [CharSpan(span.label, span.start, span.end) for span in tagger.tag(text)]


def _batches(sentences: list[Sentence], size: int):
    for index in range(0, len(sentences), size):
        yield sentences[index : index + size]
