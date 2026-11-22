"""Write the synthetic training and dev sets.

    python -m training.generate_synthetic            # 2000 train + 300 dev
    python -m training.generate_synthetic --train 4000
"""

import argparse

from .data import DATA_DIR
from .synthetic import generate, write_jsonl

TRAIN_SEED = 13
DEV_SEED = 99


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train", type=int, default=2000)
    parser.add_argument("--dev", type=int, default=300)
    args = parser.parse_args()

    train = generate(args.train, TRAIN_SEED)
    dev = generate(args.dev, DEV_SEED)
    write_jsonl(DATA_DIR / "synthetic" / "train.jsonl", train)
    write_jsonl(DATA_DIR / "synthetic" / "dev.jsonl", dev)
    print(f"wrote {len(train)} train and {len(dev)} dev emails to {DATA_DIR / 'synthetic'}")
    for row in train[:5]:
        print(f"  [{row['lang']}] {row['markup']}")


if __name__ == "__main__":
    main()
