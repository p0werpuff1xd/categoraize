"""Build the CategorAIze dataset: test/dev (hand-written) + train (templated). Writes JSONL, categories.json, reports and review sheets."""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "authoring"))

import dslib as L  # noqa: E402
from test_en import TEST_EN  # noqa: E402
from test_mixed import TEST_MIXED  # noqa: E402
from test_tl import TEST_TL  # noqa: E402
from dev import DEV  # noqa: E402
from gen_train import make_train  # noqa: E402

OUT = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs/categoraize-dataset"
os.makedirs(f"{OUT}/data", exist_ok=True)
os.makedirs(f"{OUT}/review", exist_ok=True)
os.makedirs(f"{OUT}/scripts", exist_ok=True)
os.makedirs(f"{OUT}/reports", exist_ok=True)


def build_split(split, source, tuples):
    counters = Counter()
    recs = []
    for t in tuples:
        counters[t[1]] += 1
        recs.append(L.build_record(split, source, None, counters[t[1]], t))
    return recs


test = build_split("test", "hand_written", TEST_EN + TEST_MIXED + TEST_TL)
dev = build_split("dev", "hand_written", DEV)


def text_of(r):
    return r["subject"] + " " + r["body"]


held = [(text_of(r), L.shingles(text_of(r))) for r in test + dev]
accepted_sh = []
accepted_txt = set()


def reject(text):
    if text in accepted_txt:
        return True
    sh = L.shingles(text)
    for _, h in held:
        if L.jaccard(sh, h) >= 0.6:
            return True
    for h in accepted_sh:
        if L.jaccard(sh, h) >= 0.85:
            return True
    accepted_txt.add(text)
    accepted_sh.append(sh)
    return False


train_tuples = make_train(20261117, reject)
train = build_split("train", "template_synthetic", train_tuples)

for name, recs in (("train", train), ("dev", dev), ("test", test)):
    L.write_jsonl(f"{OUT}/data/{name}.jsonl", recs)

with open(f"{OUT}/data/categories.json", "w", encoding="utf-8") as f:
    json.dump([{"slug": s, "name": L.CATEGORY_INFO[s][0], "description": L.CATEGORY_INFO[s][1]} for s in L.CATEGORY_INFO], f, ensure_ascii=False, indent=2)

# ---------------------------------------------------------------- reports
rep = ["# Balance report\n"]
for name, recs in (("train", train), ("dev", dev), ("test", test)):
    rep.append(f"\n## {name} (n={len(recs)})\n")
    for field in ("language", "gold_category", "gold_priority", "gold_register", "sender_role"):
        c = Counter(r[field] for r in recs)
        rep.append(f"- **{field}**: " + ", ".join(f"{k}={v}" for k, v in sorted(c.items(), key=lambda kv: str(kv[0]))))
    sp = Counter(s["label"] for r in recs for s in r["gold_spans"])
    amb = sum(1 for r in recs for s in r["gold_spans"] if s.get("ambiguous"))
    rep.append(f"- **spans**: TASK={sp['TASK']}, DATE={sp['DATE']} (ambiguous dates: {amb})")
    rep.append(f"- **emails with a calendar conflict**: {sum(r['gold_calendar_conflict'] for r in recs)} of {sum(1 for r in recs if r['calendar_busy'])} with busy data")
    rep.append(f"- **VIP senders**: {sum(r['is_vip'] for r in recs)}")
    rep.append("\n  category x language:")
    grid = defaultdict(Counter)
    for r in recs:
        grid[r["gold_category"]][r["language"]] += 1
    for cat in L.CATEGORY_INFO:
        rep.append(f"  - {cat}: " + ", ".join(f"{lg}={grid[cat][lg]}" for lg in L.LANGS))
open(f"{OUT}/reports/balance_report.md", "w", encoding="utf-8").write("\n".join(rep) + "\n")

# near-duplicate report: train vs test/dev, and within train
lines = ["# Near-duplicate report (3-gram word Jaccard)\n"]
sh_tt = [(r["id"], L.shingles(text_of(r))) for r in train]
sh_ho = [(r["id"], L.shingles(text_of(r))) for r in test + dev]
mx = 0
worst = None
for i, a in sh_tt:
    for j, b in sh_ho:
        v = L.jaccard(a, b)
        if v > mx:
            mx, worst = v, (i, j)
lines.append(f"- Max similarity, train vs dev/test: **{mx:.2f}** {worst}  (build rejects >= 0.60)")
mx2 = 0
w2 = None
for k in range(len(sh_tt)):
    for m in range(k + 1, len(sh_tt)):
        v = L.jaccard(sh_tt[k][1], sh_tt[m][1])
        if v > mx2:
            mx2, w2 = v, (sh_tt[k][0], sh_tt[m][0])
lines.append(f"- Max similarity within train: **{mx2:.2f}** {w2}  (build rejects >= 0.85)")
mx3 = 0
w3 = None
for k in range(len(sh_ho)):
    for m in range(k + 1, len(sh_ho)):
        a_id, b_id = sh_ho[k][0], sh_ho[m][0]
        if a_id.split("-")[0] != b_id.split("-")[0] or a_id.split("-")[1] == b_id.split("-")[1]:
            pass
        v = L.jaccard(sh_ho[k][1], sh_ho[m][1])
        if a_id.split("-")[1] == b_id.split("-")[1] and v > mx3:
            mx3, w3 = v, (a_id, b_id)
lines.append(f"- Max similarity within dev/test (same language): **{mx3:.2f}** {w3}")
lines.append("\nTest items are deliberately parallel *across* languages (same scenario in English, Taglish and Filipino) so per-language results are comparable. They are not near-duplicates within a language.")
open(f"{OUT}/reports/near_duplicate_report.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")

# ---------------------------------------------------------------- review sheets
with open(f"{OUT}/review/second_labeler_test_BLIND.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["id", "language", "sender_role", "is_vip", "received_at", "subject", "body",
                "category (work_tasks|meetings|school|job_search|finance_billing|promotions|alerts|personal)",
                "priority (1-5)", "register (formal|neutral|casual)", "notes"])
    for r in test:
        w.writerow([r["id"], r["language"], r["sender_role"], int(r["is_vip"]), r["received_at"], r["subject"], r["body"], "", "", "", ""])

with open(f"{OUT}/review/native_speaker_review.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["id", "language", "subject", "body", "gold_category", "gold_priority", "gold_register",
                "sounds_natural (1-5)", "label_ok (y/n)", "suggested_fix", "reviewer_initials"])
    for r in [x for x in test + dev if x["language"] != "en"] + [x for x in train if x["language"] != "en"][::8]:
        w.writerow([r["id"], r["language"], r["subject"], r["body"], r["gold_category"], r["gold_priority"], r["gold_register"], "", "", "", ""])

print("train", len(train), "dev", len(dev), "test", len(test))
print("max sim train-vs-heldout", round(mx, 2), "within-train", round(mx2, 2))
