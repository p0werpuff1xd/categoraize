"""Phase 5: the calendar-conflict flag is deterministic.

    python -m eval.check_conflicts

For every split, computes the flag (a) from the gold resolved DATE values and
(b) from the date normalizer applied to the gold DATE texts, and compares
both with gold_calendar_conflict. Both must match on 100% of emails; any
mismatch exits non-zero. Only ids are printed.
"""

import json
import sys

from app.nlp.date_codes import has_conflict, resolve_phrase

from .loaders import load_split
from .systems import ROOT

OUTPUT = ROOT / "eval" / "results" / "conflict_check.json"


def main() -> None:
    summary, failures = {}, []
    for split in ("train", "dev", "test"):
        records = load_split(split)
        counts = {"emails": len(records), "with_calendar": 0, "gold_conflicts": 0,
                  "match_from_gold_dates": 0, "match_from_normalizer": 0}
        for record in records:
            busy = [(period.start, period.end) for period in record.calendar_busy] or None
            dates = [span for span in record.gold_spans if span.label == "DATE"]
            from_gold = has_conflict([span.resolved for span in dates if not span.ambiguous], busy)
            from_text = has_conflict([resolve_phrase(span.text, record.received_at)[0] for span in dates], busy)
            counts["with_calendar"] += busy is not None
            counts["gold_conflicts"] += record.gold_calendar_conflict
            counts["match_from_gold_dates"] += from_gold == record.gold_calendar_conflict
            counts["match_from_normalizer"] += from_text == record.gold_calendar_conflict
            if from_gold != record.gold_calendar_conflict or from_text != record.gold_calendar_conflict:
                failures.append(record.id)
        counts["accuracy_from_gold_dates"] = counts["match_from_gold_dates"] / counts["emails"]
        counts["accuracy_from_normalizer"] = counts["match_from_normalizer"] / counts["emails"]
        summary[split] = counts
    OUTPUT.write_text(json.dumps({"splits": summary, "mismatched_ids": failures}, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=1))
    if failures:
        print("MISMATCH:", failures)
        sys.exit(1)
    print("OK: conflict flag matches gold on every email of every split")


if __name__ == "__main__":
    main()
