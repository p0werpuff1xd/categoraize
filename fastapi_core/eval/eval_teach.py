"""How much "Teach by example" helps: category accuracy of /api/v1/classify
when each label has k user examples.

Simulates a user who taught each label with k emails: the centroid is the web
app's formula (apps/web/utils/categoraize/label-examples.ts), normalize(
description + 4 * mean(examples)), with examples drawn from the synthetic
train split (fixed seed). Scored on the test split.

    python -m eval.eval_teach [--k 0 1 3 5 10] [--split test]

Synthetic and team-written data only (no real mail).
"""

import argparse
import math
import os
import random

os.environ.setdefault("CATEGORAIZE_INTERNAL_KEY", "eval-key")
os.environ["CATEGORAIZE_RATE_LIMIT_PER_MINUTE"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.embeddings import model_manager  # noqa: E402

from .loaders import load_categories, load_split  # noqa: E402
from .metrics import macro_f1  # noqa: E402

AUTH = {"X-Internal-Key": os.environ["CATEGORAIZE_INTERNAL_KEY"]}
EXAMPLE_WEIGHT = 4  # must match EXAMPLE_WEIGHT in label-examples.ts
CENTRED_THRESHOLD = 0.05  # must match CENTRED_THRESHOLD in label-matching.ts


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--k", type=int, nargs="+", default=[0, 1, 3, 5, 10])
    parser.add_argument("--split", default="test")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--only", help="teach only this label slug (the others stay description-only)")
    parser.add_argument("--raw", action="store_true", help="uncentred matching (the old behaviour)")
    args = parser.parse_args()

    model_manager.load()
    categories = load_categories()
    train = load_split("train")
    records = load_split(args.split)
    rng = random.Random(args.seed)

    with TestClient(app) as client:
        def embed(texts: list[str]) -> list[list[float]]:
            response = client.post("/api/v1/embed", json={"texts": texts}, headers=AUTH)
            response.raise_for_status()
            return response.json()["vectors"]

        descriptions = dict(
            zip(
                [c.slug for c in categories],
                embed([f"{c.name}: {c.description}" for c in categories]),
                strict=True,
            )
        )
        # The user's own mail: its mean is the background labels are centred on.
        texts = [f"{r.subject}\n\n{r.body}" for r in records]
        record_vectors = [vector for start in range(0, len(texts), 32) for vector in embed(texts[start:start + 32])]
        background = [sum(column) / len(record_vectors) for column in zip(*record_vectors, strict=True)]
        pools = {c.slug: [r for r in train if r.gold_category == c.slug] for c in categories}
        for pool in pools.values():
            rng.shuffle(pool)

        for k in args.k:
            payload_categories = []
            for category in categories:
                taught = args.only is None or args.only == category.slug
                examples = pools[category.slug][:k] if taught else []
                if examples:
                    vectors = embed([f"{r.subject}\n\n{r.body}" for r in examples])
                    mean = [sum(column) / len(vectors) for column in zip(*vectors, strict=True)]
                    centroid = _normalize(
                        [d + EXAMPLE_WEIGHT * m for d, m in zip(descriptions[category.slug], mean, strict=True)]
                    )
                else:
                    centroid = _normalize(descriptions[category.slug])
                payload_categories.append(
                    {"id": category.slug, "name": category.name, "description": category.description,
                     "centroid": centroid}
                )
            gold, predicted = [], []
            for record in records:
                response = client.post(
                    "/api/v1/classify",
                    json={"email_id": record.id, "subject": record.subject, "body": record.body,
                          "received_at": record.received_at.isoformat(), "timezone": "Asia/Manila",
                          "sender": {"email": "", "role": record.sender_role or None},
                          "categories": payload_categories,
                          **({} if args.raw else {"background": background, "threshold": CENTRED_THRESHOLD})},
                    headers=AUTH,
                )
                response.raise_for_status()
                gold.append(record.gold_category)
                predicted.append((response.json().get("category") or {}).get("id"))
            accuracy = sum(g == p for g, p in zip(gold, predicted, strict=True)) / len(gold)
            uncategorized = sum(p is None for p in predicted) / len(predicted)
            scope = f"only {args.only}" if args.only else "every label"
            share = ""
            if args.only:
                put = sum(p == args.only for p in predicted)
                share = f"  put in {args.only}: {put} (gold {sum(g == args.only for g in gold)})"
            mode = "raw" if args.raw else "centred"
            print(f"{mode} k={k:>2} examples ({scope}): accuracy {accuracy:.3f}  macro-F1 {macro_f1(gold, predicted):.3f}"
                  f"  left uncategorized {uncategorized:.0%}{share}")


if __name__ == "__main__":
    main()
