"""Tune how taught labels compete with description-only labels (dev split).

Offline (embeddings only, no endpoint) so the grid is fast. Compares, for a
user who taught every label or only one label with k examples:
- raw cosine with one shared threshold;
- mean-centred cosine: cos(e - b, c - b), b = mean embedding of the user's
  mail (here: the split being scored), with one shared threshold.

    python -m eval.tune_teach [--split dev]

Synthetic and team-written data only (no real mail).
"""

import argparse
import math
import random

from app.services.embeddings import model_manager

from .loaders import load_categories, load_split

EXAMPLE_WEIGHT = 4


def _norm(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v] if n else v


def _cos(a, b):
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return sum(x * y for x, y in zip(a, b, strict=True)) / (na * nb) if na and nb else 0.0


def _sub(a, b):
    return [x - y for x, y in zip(a, b, strict=True)]


def _mean(vectors):
    return [sum(column) / len(vectors) for column in zip(*vectors, strict=True)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", default="dev")
    args = parser.parse_args()
    model_manager.load()
    categories = load_categories()
    train = load_split("train")
    records = load_split(args.split)
    rng = random.Random(7)

    embed = model_manager.embed
    desc = dict(zip([c.slug for c in categories], embed([f"{c.name}: {c.description}" for c in categories]),
                    strict=True))
    pools = {c.slug: [r for r in train if r.gold_category == c.slug] for c in categories}
    for pool in pools.values():
        rng.shuffle(pool)
    email_vectors = embed([f"{r.subject}\n\n{r.body}" for r in records])
    background = _mean(email_vectors)
    example_vectors = {
        slug: embed([f"{r.subject}\n\n{r.body}" for r in pool[:10]]) if pool else [] for slug, pool in pools.items()
    }

    def centroids(k, only):
        out = {}
        for slug, d in desc.items():
            ex = example_vectors[slug][:k] if (only is None or only == slug) else []
            out[slug] = _norm([a + EXAMPLE_WEIGHT * b for a, b in zip(d, _mean(ex), strict=True)]) if ex else _norm(d)
        return out

    def score(k, only, centred, threshold):
        cents = centroids(k, only)
        correct = put = 0
        for record, vector in zip(records, email_vectors, strict=True):
            sims = {
                slug: _cos(_sub(vector, background), _sub(c, background)) if centred else _cos(vector, c)
                for slug, c in cents.items()
            }
            best = max(sims, key=sims.get)
            chosen = best if sims[best] >= threshold else None
            correct += chosen == record.gold_category
            put += only is not None and chosen == only
        return correct / len(records), put

    for centred in (False, True):
        grid = [0.35] if not centred else [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]
        for threshold in grid:
            row = []
            for k in (0, 3, 10):
                acc, _ = score(k, None, centred, threshold)
                row.append(f"all k={k}: {acc:.2f}")
            for only in ("finance_billing", "promotions", "work_tasks"):
                acc, put = score(10, only, centred, threshold)
                gold = sum(r.gold_category == only for r in records)
                row.append(f"only {only[:5]} k=10: {acc:.2f} put {put}/{gold}")
            print(f"{'centred' if centred else 'raw    '} t={threshold:.2f} | " + " | ".join(row))


if __name__ == "__main__":
    main()
