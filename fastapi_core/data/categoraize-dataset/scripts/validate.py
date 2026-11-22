"""Standalone validator. Usage: python validate.py <dataset_dir>. Exits non-zero on any error."""
import datetime as dt
import json
import sys
from collections import Counter

root = sys.argv[1] if len(sys.argv) > 1 else "."
CATS = {c["slug"] for c in json.load(open(f"{root}/data/categories.json", encoding="utf-8"))}
REG = {"formal", "neutral", "casual"}
LANG = {"en", "mixed", "tl"}
errors = []


def err(rid, msg):
    errors.append(f"{rid}: {msg}")


splits = {}
for name in ("train", "dev", "test"):
    splits[name] = [json.loads(l) for l in open(f"{root}/data/{name}.jsonl", encoding="utf-8") if l.strip()]

seen_ids = set()
for name, recs in splits.items():
    for r in recs:
        rid = r.get("id", "?")
        if rid in seen_ids:
            err(rid, "duplicate id")
        seen_ids.add(rid)
        if r["split"] != name:
            err(rid, "split mismatch")
        if r["gold_category"] not in CATS:
            err(rid, f"bad category {r['gold_category']}")
        if r["gold_priority"] not in (1, 2, 3, 4, 5):
            err(rid, "bad priority")
        if r["gold_register"] not in REG:
            err(rid, "bad register")
        if r["language"] not in LANG:
            err(rid, "bad language")
        if r["human_reviewed"] is not False:
            err(rid, "human_reviewed must be false until a person has reviewed it")
        recv = dt.datetime.fromisoformat(r["received_at"])
        for s in r["gold_spans"]:
            if r["body"][s["start"]:s["end"]] != s["text"]:
                err(rid, f"span offset mismatch: {s['text']!r}")
            if s["label"] not in ("TASK", "DATE"):
                err(rid, "bad span label")
            if s["label"] == "DATE":
                if s.get("ambiguous"):
                    if s.get("resolved"):
                        err(rid, "ambiguous date must not carry a resolved value")
                else:
                    if not s.get("resolved"):
                        err(rid, f"unresolved date {s['text']!r}")
                    elif dt.datetime.fromisoformat(s["resolved"] + ("T00:00:00+08:00" if len(s["resolved"]) == 10 else "")) < recv.replace(hour=0, minute=0) :
                        err(rid, f"date resolves before received: {s['text']!r}")
        spans = sorted(r["gold_spans"], key=lambda s: s["start"])
        for a, b in zip(spans, spans[1:]):
            if a["end"] > b["start"]:
                err(rid, "overlapping spans")
        # recompute conflict
        conflict = False
        for s in r["gold_spans"]:
            res = s.get("resolved")
            if s["label"] == "DATE" and res and len(res) > 10:
                t = dt.datetime.fromisoformat(res)
                for b in r["calendar_busy"]:
                    if dt.datetime.fromisoformat(b["start"]) <= t < dt.datetime.fromisoformat(b["end"]):
                        conflict = True
        if conflict != r["gold_calendar_conflict"]:
            err(rid, "calendar conflict flag inconsistent")
        if r["gold_category"] == "promotions" and r["gold_priority"] > 2:
            err(rid, "promotion with priority > 2 (check guideline)")

# leakage: exact text overlap across splits
txt = {n: {(r["subject"], r["body"]) for r in recs} for n, recs in splits.items()}
for a, b in (("train", "dev"), ("train", "test"), ("dev", "test")):
    inter = txt[a] & txt[b]
    if inter:
        errors.append(f"leakage: {len(inter)} identical emails in {a} and {b}")

print({n: len(r) for n, r in splits.items()})
print("languages (test):", dict(Counter(r["language"] for r in splits["test"])))
if errors:
    print(f"{len(errors)} ERRORS")
    print("\n".join(errors[:50]))
    sys.exit(1)
print("OK: no errors")
