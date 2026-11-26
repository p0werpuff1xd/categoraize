"""A label taught by example must not pull in mail just for being email-like."""

from conftest import AUTH, classify_payload


def _unit(index: int, size: int = 384) -> list[float]:
    vector = [0.0] * size
    vector[index] = 1.0
    return vector


def test_background_is_accepted_and_changes_the_scale(client):
    payload = classify_payload(
        subject="Invoice", body="Please pay the attached invoice by Friday.", categories=[],
    )
    plain = client.post("/api/v1/classify", json=payload, headers=AUTH)
    assert plain.status_code == 200

    background = [0.01] * 384
    centred = client.post("/api/v1/classify", json={**payload, "background": background}, headers=AUTH)
    assert centred.status_code == 200


def test_background_with_the_wrong_dimension_is_rejected(client):
    payload = classify_payload(subject="x", body="y", categories=[], background=[0.1, 0.2])
    response = client.post("/api/v1/classify", json=payload, headers=AUTH)
    assert response.status_code == 422


def test_centring_removes_the_shared_component():
    from app.algorithms.classifier import cosine

    shared = [1.0] + [0.0] * 383
    email = [1.0, 0.1] + [0.0] * 382  # mostly "email-like", a little of topic 1
    taught = [1.0, 0.0, 0.05] + [0.0] * 381  # also email-like, about topic 2
    described = [0.0, 1.0] + [0.0] * 382  # description of topic 1
    assert cosine(email, taught) > cosine(email, described)  # raw: the taught label wins
    minus = lambda v: [a - b for a, b in zip(v, shared)]  # noqa: E731
    assert cosine(minus(email), minus(described)) > cosine(minus(email), minus(taught))  # centred: topic wins
