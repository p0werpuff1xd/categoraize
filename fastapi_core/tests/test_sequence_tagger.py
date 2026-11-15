from pathlib import Path

import pytest

from app.algorithms.sequence_tagger import SequenceTagger, TaggerConfig, save_model
from training.data import Example, load_markup_file, to_sentences
from training.evaluation import evaluate
from training.synthetic import generate
from training.train_lib import train_tagger
from app.nlp.tokens import parse_markup


def _examples(count: int, seed: int) -> list[Example]:
    rows = generate(count, seed)
    return [Example(*parse_markup(row["markup"]), row["lang"], "synthetic") for row in rows]


def test_synthetic_labels_line_up_with_tokens():
    for sentence in to_sentences(_examples(200, 3)):
        assert len(sentence.tokens) == len(sentence.tags)
        # A sentence never begins inside a span that started in an earlier sentence.
        assert not sentence.tags or not sentence.tags[0].startswith("I-")


def test_tiny_training_run_saves_loads_and_tags(tmp_path: Path):
    config = TaggerConfig(word_dim=16, char_dim=8, char_filters=8, hidden=16, dropout=0.1)
    tagger, history = train_tagger(_examples(150, 1), _examples(20, 2), config=config, epochs=3, log=lambda _: None)
    assert len(history) == 3
    assert history[-1]["loss"] < history[0]["loss"]

    save_model(tmp_path / "v1", tagger.model, tagger.vocab, {"version": "v1"})
    loaded = SequenceTagger.from_directory(tmp_path / "v1")
    assert loaded.version == "v1"
    text = "Hi team, paki-send ang report bukas. Salamat!"
    spans = loaded.tag(text)
    assert all(text[span.start : span.end] == span.text for span in spans)
    assert evaluate(_examples(10, 4), lambda t: [])["overall"]["entity"]["micro"]["recall"] == 0.0


def test_training_data_must_live_under_the_data_folder(tmp_path: Path):
    outside = tmp_path / "mailbox_export.md"
    outside.write_text("[TASK]send it[/TASK]", encoding="utf-8")
    with pytest.raises(ValueError, match="must live under"):
        load_markup_file(outside)
