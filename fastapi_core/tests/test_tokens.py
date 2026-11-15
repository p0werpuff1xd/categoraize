import pytest

from app.nlp.tokens import CharSpan, MarkupError, bio_to_spans, parse_markup, spans_to_bio, split_sentences, tokenize


def test_tokenize_keeps_hyphenated_words_and_offsets():
    text = "Paki-send ang report, salamat!"
    tokens = tokenize(text)
    assert [token.text for token in tokens] == ["Paki-send", "ang", "report", ",", "salamat", "!"]
    assert all(text[token.start : token.end] == token.text for token in tokens)


def test_markup_round_trips_through_bio():
    text, spans = parse_markup("Hi, [TASK]paki-send ang report[/TASK] [DATE]bukas ng umaga[/DATE].")
    assert text == "Hi, paki-send ang report bukas ng umaga."
    tokens = tokenize(text)
    tags = spans_to_bio(tokens, spans)
    assert tags == ["O", "O", "B-TASK", "I-TASK", "I-TASK", "B-DATE", "I-DATE", "I-DATE", "O"]
    assert bio_to_spans(tokens, tags) == spans


def test_stray_inside_tag_starts_a_new_span():
    tokens = tokenize("send it bukas")
    assert bio_to_spans(tokens, ["O", "O", "I-DATE"]) == [CharSpan("DATE", 8, 13)]


@pytest.mark.parametrize("bad", ["[TASK]open", "[TASK]a [DATE]b[/DATE][/TASK]", "x[/DATE]"])
def test_unbalanced_markup_is_rejected(bad):
    with pytest.raises(MarkupError):
        parse_markup(bad)


def test_titles_do_not_end_sentences():
    text = "Please call Ms. Reyes and Dr. Cruz today. Salamat po."
    sentences = split_sentences(text, tokenize(text))
    assert len(sentences) == 2
    assert sentences[0][-2].text == "today"


def test_amounts_and_abbreviations_do_not_end_sentences():
    text = "Please pay PHP 1,980.00 today. Thanks!\nSalamat"
    sentences = split_sentences(text, tokenize(text))
    assert [" ".join(token.text for token in sentence) for sentence in sentences] == [
        "Please pay PHP 1 , 980 . 00 today .",
        "Thanks !",
        "Salamat",
    ]
