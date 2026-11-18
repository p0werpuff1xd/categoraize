"""Typed loading of the dataset splits.

Only train is used for fitting, dev for tuning, and test once per final run.
All records are fictional (no real user mail); labels are AI-authored.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

DATASET_DIR = Path(__file__).resolve().parent.parent / "data" / "categoraize-dataset"
Split = Literal["train", "dev", "test"]
LANGUAGES = ("en", "mixed", "tl")


@dataclass(frozen=True)
class GoldSpan:
    label: str
    text: str
    start: int
    end: int
    resolved: str | None = None
    ambiguous: bool = False


@dataclass(frozen=True)
class BusyPeriod:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class Record:
    id: str
    split: str
    language: str
    subject: str
    body: str
    sender_role: str
    is_vip: bool
    received_at: datetime
    gold_category: str
    gold_spans: tuple[GoldSpan, ...]
    gold_priority: int
    gold_register: str
    calendar_busy: tuple[BusyPeriod, ...]
    gold_calendar_conflict: bool
    human_reviewed: bool


@dataclass(frozen=True)
class Category:
    slug: str
    name: str
    description: str


def load_split(split: Split, dataset_dir: Path = DATASET_DIR) -> list[Record]:
    path = dataset_dir / "data" / f"{split}.jsonl"
    with path.open(encoding="utf-8") as handle:
        return [_record(json.loads(line)) for line in handle if line.strip()]


def load_categories(dataset_dir: Path = DATASET_DIR) -> list[Category]:
    rows = json.loads((dataset_dir / "data" / "categories.json").read_text(encoding="utf-8"))
    return [Category(row["slug"], row["name"], row["description"]) for row in rows]


def _record(row: dict) -> Record:
    return Record(
        id=row["id"],
        split=row["split"],
        language=row["language"],
        subject=row["subject"],
        body=row["body"],
        sender_role=row["sender_role"],
        is_vip=bool(row["is_vip"]),
        received_at=datetime.fromisoformat(row["received_at"]),
        gold_category=row["gold_category"],
        gold_spans=tuple(
            GoldSpan(
                label=span["label"],
                text=span["text"],
                start=span["start"],
                end=span["end"],
                resolved=span.get("resolved"),
                ambiguous=bool(span.get("ambiguous", False)),
            )
            for span in row["gold_spans"]
        ),
        gold_priority=int(row["gold_priority"]),
        gold_register=row["gold_register"],
        calendar_busy=tuple(
            BusyPeriod(datetime.fromisoformat(period["start"]), datetime.fromisoformat(period["end"]))
            for period in row["calendar_busy"]
        ),
        gold_calendar_conflict=bool(row["gold_calendar_conflict"]),
        human_reviewed=bool(row.get("human_reviewed", False)),
    )
