from conftest import AUTH

from app.nlp.summarizer import split_sentences, summarize

BODY = """Hi team,
The quarterly audit starts next month and the auditors will visit all three branches.
Please send the signed inventory reports by Friday.
The cafeteria will also serve a new menu starting Monday.
Thanks!"""


def test_split_drops_greetings_signoffs_and_fragments():
    assert split_sentences(BODY) == [
        "The quarterly audit starts next month and the auditors will visit all three branches.",
        "Please send the signed inventory reports by Friday.",
        "The cafeteria will also serve a new menu starting Monday.",
    ]


def test_summary_keeps_original_sentences_in_order_and_prefers_requests():
    sentences = split_sentences(BODY)
    flat = [[1.0, 0.0], [0.9, 0.1], [0.95, 0.05]]
    result = summarize(
        sentences,
        embed=lambda texts: flat,
        span_labels=lambda sentence: {"TASK", "DATE"} if sentence.startswith("Please") else set(),
        limit=2,
    )
    assert result[1] == "Please send the signed inventory reports by Friday."
    assert all(sentence in BODY for sentence in result)
    assert len(result) == 2


def test_summarize_endpoint_returns_extractive_sentences(client):
    response = client.post("/api/v1/summarize", json={"body": BODY, "max_sentences": 2}, headers=AUTH)
    assert response.status_code == 200
    sentences = response.json()["sentences"]
    assert len(sentences) == 2
    assert all(sentence in BODY for sentence in sentences)
    assert "Please send the signed inventory reports by Friday." in sentences
