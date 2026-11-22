from conftest import AUTH, classify_payload


def test_rejects_missing_key(unloaded_client):
    response = unloaded_client.post("/api/v1/embed", json={"texts": ["hello"]})
    assert response.status_code == 401


def test_rejects_wrong_key(unloaded_client):
    response = unloaded_client.post("/api/v1/embed", json={"texts": ["hello"]}, headers={"X-Internal-Key": "nope"})
    assert response.status_code == 401


def test_returns_503_while_model_loads(unloaded_client):
    assert unloaded_client.get("/healthz").status_code == 503
    assert unloaded_client.post("/api/v1/embed", json={"texts": ["hello"]}, headers=AUTH).status_code == 503
    assert unloaded_client.post("/api/v1/classify", json=classify_payload(), headers=AUTH).status_code == 503


def test_healthz_ready(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"


def test_embed_returns_normalized_384_vectors(client):
    response = client.post("/api/v1/embed", json={"texts": ["Please submit the report.", "Paki-send bukas."]}, headers=AUTH)
    assert response.status_code == 200
    vectors = response.json()["vectors"]
    assert len(vectors) == 2
    assert all(len(vector) == 384 for vector in vectors)
    assert abs(sum(value * value for value in vectors[0]) - 1.0) < 1e-4


def test_rejects_invalid_payloads(client):
    assert client.post("/api/v1/embed", json={"texts": []}, headers=AUTH).status_code == 422
    bad_centroid = classify_payload(categories=[{"id": "x", "name": "X", "centroid": [0.1, 0.2]}])
    assert client.post("/api/v1/classify", json=bad_centroid, headers=AUTH).status_code == 422
    naive_time = classify_payload(received_at="2026-11-09T09:00:00")
    assert client.post("/api/v1/classify", json=naive_time, headers=AUTH).status_code == 422
    bad_zone = classify_payload(timezone="Mars/Olympus")
    assert client.post("/api/v1/classify", json=bad_zone, headers=AUTH).status_code == 422
