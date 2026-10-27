from dataclasses import dataclass
from pathlib import Path

from .preprocessing import tokenize
from .schemas import BilstmCrfOutput, Entity

try:
    import torch
    from torch import nn
except ImportError:  # The API remains runnable without the optional DL runtime.
    torch = None
    nn = None


if torch is not None:

    class BiLSTMCRFModel(nn.Module):
        def __init__(self, vocab_size: int, embedding_dim: int, hidden_dim: int, label_count: int):
            super().__init__()
            self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=0)
            self.encoder = nn.LSTM(
                embedding_dim,
                hidden_dim // 2,
                bidirectional=True,
                batch_first=True,
            )
            self.emission = nn.Linear(hidden_dim, label_count)
            self.transitions = nn.Parameter(torch.zeros(label_count, label_count))
            self.start_transitions = nn.Parameter(torch.zeros(label_count))
            self.end_transitions = nn.Parameter(torch.zeros(label_count))

        def emissions(self, token_ids):
            encoded, _ = self.encoder(self.embedding(token_ids))
            return self.emission(encoded)

        def decode(self, emission_scores):
            scores = self.start_transitions + emission_scores[0]
            paths = []
            for emission in emission_scores[1:]:
                next_scores = scores[:, None] + self.transitions + emission[None, :]
                scores, indices = next_scores.max(dim=0)
                paths.append(indices)
            scores = scores + self.end_transitions
            last = int(scores.argmax())
            decoded = [last]
            for indices in reversed(paths):
                last = int(indices[last])
                decoded.append(last)
            return list(reversed(decoded))

else:

    class BiLSTMCRFModel:  # type: ignore[no-redef]
        def __init__(self, *_args, **_kwargs):
            raise RuntimeError("PyTorch is required for BiLSTM-CRF inference")


@dataclass
class BilstmCrfTagger:
    checkpoint: Path

    @property
    def model_version(self) -> str:
        return f"bilstm-crf:{self.checkpoint.name}"

    def tag(self, text: str) -> BilstmCrfOutput:
        if torch is None or not self.checkpoint.exists():
            return BilstmCrfOutput(status="unavailable", model_version=self.model_version)
        try:
            checkpoint = torch.load(self.checkpoint, map_location="cpu", weights_only=True)
            vocabulary = checkpoint["vocab"]
            labels = checkpoint["labels"]
            model = BiLSTMCRFModel(
                len(vocabulary),
                checkpoint["embedding_dim"],
                checkpoint["hidden_dim"],
                len(labels),
            )
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            words = tokenize(text)
            ids = [vocabulary.get(word.casefold(), vocabulary["<unk>"]) for word in words]
            with torch.no_grad():
                tag_ids = model.decode(model.emissions(torch.tensor([ids]))[0])
            entities = _entities_from_bio(text, words, tag_ids, labels)
            return BilstmCrfOutput(
                status="ready", entities=entities, model_version=self.model_version
            )
        except Exception:
            return BilstmCrfOutput(status="unavailable", model_version=self.model_version)


def _entities_from_bio(
    text: str, words: list[str], tag_ids: list[int], labels: list[str]
) -> list[Entity]:
    entities: list[Entity] = []
    offsets: list[tuple[int, int]] = []
    cursor = 0
    for word in words:
        start = text.find(word, cursor)
        end = start + len(word)
        offsets.append((start, end))
        cursor = end
    active_label: str | None = None
    active_start = 0

    for index, (word, tag_id) in enumerate(zip(words, tag_ids, strict=True)):
        tag = labels[tag_id]
        if tag.startswith("B-") or tag == "O" or (
            tag.startswith("I-") and tag[2:] != active_label
        ):
            if active_label is not None:
                start, _ = offsets[active_start]
                _, end = offsets[index - 1]
                entities.append(
                    Entity(
                        text=text[start:end],
                        label=active_label,
                        start=start,
                        end=end,
                    )
                )
            active_label = tag[2:] if tag != "O" else None
            active_start = index
        cursor += len(word) + 1

    if active_label is not None:
        start, _ = offsets[active_start]
        _, end = offsets[-1]
        entities.append(
            Entity(text=text[start:end], label=active_label, start=start, end=end)
        )
    return entities
