from app.nlp.summarizer import summarize


def test_summary_returns_original_salient_sentences_in_source_order():
    text = "The deployment is complete. Please review the staging error before tomorrow. FYI this is archived."
    result = summarize(text)
    assert result == [
        "The deployment is complete.",
        "Please review the staging error before tomorrow.",
    ]
    assert all(sentence in text for sentence in result)
