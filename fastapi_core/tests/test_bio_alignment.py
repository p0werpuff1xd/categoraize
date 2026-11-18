import pytest

from app.nlp.tokens import CharSpan, bio_to_spans, spans_to_bio, tokenize
from eval.loaders import load_split


def _round_trip(text: str, spans: list[CharSpan]) -> list[CharSpan]:
    tokens = tokenize(text)
    return bio_to_spans(tokens, spans_to_bio(tokens, spans))


def _span(text: str, label: str, phrase: str) -> CharSpan:
    start = text.index(phrase)
    return CharSpan(label, start, start + len(phrase))


@pytest.mark.parametrize("word", ["i-submit", "paki-send", "mag-Friday", "pa-review", "na-update"])
def test_hyphenated_filipino_forms_stay_one_token(word):
    assert [token.text for token in tokenize(f"bago {word} po")] == ["bago", word, "po"]


def test_mag_prefix_is_left_out_of_a_date_span():
    text = "I-submit ang report bago mag-Friday."
    spans = [_span(text, "TASK", "I-submit ang report"), _span(text, "DATE", "Friday")]
    assert _round_trip(text, spans) == spans


def test_pa_prefix_is_left_out_of_a_task_but_i_and_paki_are_kept():
    text = "Alex, pa-review ng contract. Paki-send ang slides at i-upload ang deck."
    spans = [
        _span(text, "TASK", "review ng contract"),
        _span(text, "TASK", "Paki-send ang slides"),
        _span(text, "TASK", "i-upload ang deck"),
    ]
    assert _round_trip(text, spans) == spans


@pytest.mark.parametrize("split", ["train", "dev"])
def test_gold_spans_round_trip_to_the_original_offsets(split):
    for record in load_split(split):
        gold = [CharSpan(span.label, span.start, span.end) for span in record.gold_spans]
        back = _round_trip(record.body, gold)
        assert sorted(back, key=lambda s: s.start) == sorted(gold, key=lambda s: s.start), record.id
