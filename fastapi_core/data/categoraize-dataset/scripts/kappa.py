"""Inter-annotator agreement between the gold labels and a second labeler's filled-in sheet.

Usage: python kappa.py <dataset_dir> <second_labeler_filled.csv>
Reports Cohen's kappa (category, register), quadratic-weighted kappa (priority), and exact agreement,
overall and per language. Interpret: <0.40 poor, 0.40-0.60 moderate, 0.60-0.80 substantial, >0.80 almost perfect.
"""
import csv
import json
import sys
from collections import Counter, defaultdict

root, sheet = sys.argv[1], sys.argv[2]
gold = {}
for l in open(f"{root}/data/test.jsonl", encoding="utf-8"):
    r = json.loads(l)
    gold[r["id"]] = r


def kappa(a, b, labels, weights=None):
    n = len(a)
    idx = {l: i for i, l in enumerate(labels)}
    k = len(labels)
    obs = [[0] * k for _ in range(k)]
    for x, y in zip(a, b):
        obs[idx[x]][idx[y]] += 1
    ra = [sum(row) for row in obs]
    cb = [sum(obs[i][j] for i in range(k)) for j in range(k)]
    w = (lambda i, j: 0 if i == j else 1) if weights is None else (lambda i, j: ((i - j) / (k - 1)) ** 2)
    num = sum(w(i, j) * obs[i][j] for i in range(k) for j in range(k)) / n
    den = sum(w(i, j) * ra[i] * cb[j] for i in range(k) for j in range(k)) / (n * n)
    return 1.0 if den == 0 else 1 - num / den


rows = []
with open(sheet, encoding="utf-8-sig", newline="") as f:
    rd = csv.reader(f)
    header = next(rd)
    for row in rd:
        rid = row[0]
        cat, pri, reg = row[7].strip().lower(), row[8].strip(), row[9].strip().lower()
        if rid in gold and cat and pri and reg:
            rows.append((rid, cat, int(pri), reg))
if not rows:
    sys.exit("No completed rows found.")

CATS = ["work_tasks", "meetings", "school", "job_search", "finance_billing", "promotions", "alerts", "personal"]
REGS = ["formal", "neutral", "casual"]


def report(name, subset):
    if len(subset) < 5:
        return
    g = [gold[r[0]] for r in subset]
    kc = kappa([x["gold_category"] for x in g], [r[1] for r in subset], CATS)
    kp = kappa([x["gold_priority"] for x in g], [r[2] for r in subset], [1, 2, 3, 4, 5], weights="quad")
    kr = kappa([x["gold_register"] for x in g], [r[3] for r in subset], REGS)
    ac = sum(x["gold_category"] == r[1] for x, r in zip(g, subset)) / len(subset)
    ap = sum(x["gold_priority"] == r[2] for x, r in zip(g, subset)) / len(subset)
    print(f"{name:8s} n={len(subset):3d}  category kappa={kc:.2f} (agree {ac:.0%})  priority wkappa={kp:.2f} (exact {ap:.0%})  register kappa={kr:.2f}")


report("ALL", rows)
by = defaultdict(list)
for r in rows:
    by[gold[r[0]]["language"]].append(r)
for lg in ("en", "mixed", "tl"):
    report(lg, by[lg])
dis = [(r[0], gold[r[0]]["gold_category"], r[1], gold[r[0]]["gold_priority"], r[2]) for r in rows if gold[r[0]]["gold_category"] != r[1] or abs(gold[r[0]]["gold_priority"] - r[2]) >= 2]
if dis:
    print("\nDisagreements to adjudicate (id, gold_cat, labeler_cat, gold_pri, labeler_pri):")
    for d in dis:
        print(" ", d)
