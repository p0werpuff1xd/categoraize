"""C9 Category discovery: /api/v1/discover clusters ids + vectors, never text."""

import random

from conftest import AUTH

DIM = 384


def _unit(i, noise):
    vector = [0.0] * DIM
    vector[i] = 1.0
    vector[(i + 7) % DIM] = noise
    return vector


def _vectors():
    items = []
    for group, axis in enumerate((0, 50, 100)):
        for member in range(4):
            items.append({"id": f"g{group}-m{member}", "vector": _unit(axis, 0.05 * member)})
    items.append({"id": "noise", "vector": _unit(300, 0.0)})
    return items


def _discover(client, vectors, min_size=3):
    response = client.post("/api/v1/discover", headers=AUTH, json={"vectors": vectors, "min_cluster_size": min_size})
    assert response.status_code == 200, response.text
    return response.json()


def _membership(result):
    return sorted(sorted(cluster["member_ids"]) for cluster in result["clusters"])


def test_three_groups_are_found(client, case):
    result = _discover(client, _vectors())
    case("3 groups of 4 near-identical vectors + 1 outlier", [["g0-m0", "...4"], ["g1-...4"], ["g2-...4"]],
         _membership(result), tc="C9-01")
    assert _membership(result) == [[f"g{g}-m{m}" for m in range(4)] for g in range(3)]


def test_response_has_ids_and_vectors_only(client, case):
    result = _discover(client, _vectors())
    keys = {"top": sorted(result), "cluster": sorted({k for c in result["clusters"] for k in c})}
    case("discover response fields", {"top": ["clusters", "noise_ids"], "cluster": ["centroid", "cluster_id", "cohesion", "member_ids"]},
         keys, tc="C9-02")
    assert keys == {"top": ["clusters", "noise_ids"], "cluster": ["centroid", "cluster_id", "cohesion", "member_ids"]}


def test_text_is_not_accepted(client, case):
    items = _vectors()
    items[0]["text"] = "Hi, here is my private email body"
    response = client.post("/api/v1/discover", headers=AUTH, json={"vectors": items})
    case("a vector item that also carries email text", 422, response.status_code, tc="C9-03")
    assert response.status_code == 422


def test_clustering_is_deterministic(client, case):
    runs = [_membership(_discover(client, _vectors())) for _ in range(3)]
    shuffled = _vectors()
    random.Random(7).shuffle(shuffled)
    runs.append(_membership(_discover(client, shuffled)))
    case("same vectors 3 times, then shuffled", "identical clusters every time", all(r == runs[0] for r in runs), tc="C9-04")
    assert all(r == runs[0] for r in runs)


def test_centroids_are_unit_vectors(client, case):
    result = _discover(client, _vectors())
    norms = [round(sum(v * v for v in c["centroid"]) ** 0.5, 6) for c in result["clusters"]]
    case("norm of each returned centroid", [1.0] * len(norms), norms, tc="C9-05")
    assert norms == [1.0] * len(norms)


def test_too_few_vectors_rejected(client, case):
    response = client.post("/api/v1/discover", headers=AUTH, json={"vectors": _vectors()[:1]})
    case("a single vector", 422, response.status_code, tc="C9-06")
    assert response.status_code == 422
