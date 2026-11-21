"""Charts for the system documentation (Figures 20, 21 and 22).

Every value is read from a result file in the repository:
  Figure 20  fastapi_core/eval/results/B{1..4}_test.json   (frozen test split, n=100)
  Figure 21  fastapi_core/eval/results/human_review.json   (team second labeler)
  Figure 22  the activity list below, whose evidence paths are in the documentation

Usage: python scripts/docs/make_charts.py
Writes PNG (300 dpi) and SVG to docs/system-documentation/figures/.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "system-documentation" / "figures"
RESULTS = ROOT / "fastapi_core" / "eval" / "results"

# Validated categorical slots 1-4 (dataviz reference palette, light mode, white surface).
SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
INK, INK_2, GRID, TRACK = "#1f1f1e", "#5f5e58", "#e6e5e0", "#ecebe6"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 10,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK_2,
    "xtick.color": INK_2,
    "ytick.color": INK_2,
    "axes.titlecolor": INK,
    "svg.fonttype": "none",
})


def save(fig, name: str) -> None:
    for ext in ("png", "svg"):
        fig.savefig(OUT / f"{name}.{ext}", dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def recessive(ax) -> None:
    ax.spines[["top", "right", "left"]].set_visible(False)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def figure20() -> None:
    metrics = [
        ("category_macro_f1", "Category macro-F1"),
        ("category_accuracy", "Category accuracy"),
        ("priority_exact", "Priority exact"),
        ("priority_within1", "Priority within 1 level"),
        ("priority_qwk", "Priority QWK"),
        ("register_accuracy", "Register accuracy"),
        ("span_micro_f1", "TASK/DATE span micro-F1"),
        ("date_resolution_accuracy", "Resolved-date accuracy"),
        ("conflict_accuracy", "Calendar-conflict accuracy"),
    ]
    systems = ["B1", "B2", "B3", "B4"]
    data = {s: json.loads((RESULTS / f"{s}_test.json").read_text(encoding="utf-8"))["results"]["overall"]["metrics"]
            for s in systems}
    fig, ax = plt.subplots(figsize=(8.2, 7.2))
    height = 0.19
    for i, s in enumerate(systems):
        ys = [r + (i - 1.5) * height for r in range(len(metrics))]  # B1 on top, as in the legend
        vals = [data[s][k]["value"] for k, _ in metrics]
        lows = [data[s][k]["value"] - data[s][k]["low"] for k, _ in metrics]
        highs = [data[s][k]["high"] - data[s][k]["value"] for k, _ in metrics]
        ax.barh(ys, vals, height=height - 0.025, color=SERIES[i], label=s, zorder=2)
        ax.errorbar(vals, ys, xerr=[lows, highs], fmt="none", ecolor=INK_2, elinewidth=0.8, capsize=1.8, zorder=3)
        for y, v, hi in zip(ys, vals, highs):
            ax.text(v + hi + 0.012, y, f"{v:.3f}", va="center", fontsize=6.5, color=INK_2)
    ax.set_yticks(range(len(metrics)), [label for _, label in metrics])
    ax.invert_yaxis()
    ax.set_xlim(0, 1.12)
    ax.set_xlabel("Score on the frozen test split (n = 100); whiskers are 95% bootstrap CIs")
    recessive(ax)
    ax.legend(title=None, ncols=4, loc="lower center", bbox_to_anchor=(0.45, 1.0), frameon=False)
    ax.set_title("B1 rules  ·  B2 SBERT zero-shot  ·  B3 SBERT tuned  ·  B4 SBERT tuned + Bi-LSTM-CRF + learned priority",
                 fontsize=8.5, color=INK_2, pad=26)
    save(fig, "fig20-b1-b4-results")


def figure21() -> None:
    review = json.loads((RESULTS / "human_review.json").read_text(encoding="utf-8"))
    m = review["second_labeler"]["scopes"]["overall"]["metrics"]
    rows = [
        ("Category (Cohen's κ)", m["category_kappa"]),
        ("Priority (weighted κ)", m["priority_weighted_kappa"]),
        ("Register (Cohen's κ)", m["register_kappa"]),
    ]
    fig, ax = plt.subplots(figsize=(7.4, 2.9))
    ys = list(range(len(rows)))
    vals = [r[1]["value"] for r in rows]
    ax.barh(ys, vals, height=0.5, color=SERIES[0], zorder=2)
    ax.errorbar(vals, ys, xerr=[[v - r[1]["low"] for v, r in zip(vals, rows)], [r[1]["high"] - v for v, r in zip(vals, rows)]],
                fmt="none", ecolor=INK_2, elinewidth=0.9, capsize=2.5, zorder=3)
    for y, (label, metric) in zip(ys, rows):
        ax.text(metric["high"] + 0.015, y, f"{metric['value']:.2f}", va="center", fontsize=9, color=INK)
    for x, name in ((0.41, "moderate"), (0.61, "substantial"), (0.81, "almost perfect")):
        ax.axvline(x, color=GRID, linewidth=1, linestyle=(0, (3, 3)), zorder=1)
        ax.text(x + 0.005, -0.62, name, fontsize=7, color=INK_2, va="bottom")
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 1.0)
    ax.set_ylim(len(rows) - 0.5, -0.75)
    ax.set_xlabel("Agreement with gold labels, test set (n = 100); whiskers: 95% bootstrap CI")
    recessive(ax)
    save(fig, "fig21-inter-annotator-agreement")


# Figure 22: development and verification activities. Complete = 1, partial = fraction executed.
ACTIVITIES = [
    ("Phase 0  Audit and clean-up", 1.0),
    ("Phase 1  FastAPI NLP service", 1.0),
    ("Phase 2  Data wiring", 1.0),
    ("Phase 3  User interface", 1.0),
    ("Phase 4  Bi-LSTM-CRF tagger", 1.0),
    ("Phase 5  Replace generative AI paths", 1.0),
    ("Phase 6  Calendar and semantic search", 1.0),
    ("Phase 7  IAS foundation, contacts, feedback", 1.0),
    ("Phase 8  Consent, documentation, deployment", 1.0),
    ("Phase 10  Data rights and hardening", 1.0),
    ("Phase 11  Encryption, PII masking, RLS", 1.0),
    ("Phase 12  Evaluation and wrap-up", 1.0),
    ("Component (unit) testing, 312 cases", 1.0),
    ("Model evaluation, B1-B4 on the test split", 1.0),
    ("Inter-annotator agreement", 1.0),
    ("System testing, 32 of 61 steps executed", 32 / 61),
    ("Usability testing (SUS, SEQ)", 0.0),
]


def figure22() -> None:
    fig, ax = plt.subplots(figsize=(7.6, 6.4))
    ys = list(range(len(ACTIVITIES)))
    done = [a[1] for a in ACTIVITIES]
    ax.barh(ys, [1] * len(ys), height=0.62, color=TRACK, zorder=1)
    ax.barh(ys, done, height=0.62, color=SERIES[0], zorder=2)
    for y, v in zip(ys, done):
        ax.text(1.02, y, f"{v:.0%}", va="center", fontsize=8.5, color=INK)
    ax.set_yticks(ys, [a[0] for a in ACTIVITIES], fontsize=8.5)
    ax.invert_yaxis()
    ax.set_xlim(0, 1.1)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0], ["0%", "25%", "50%", "75%", "100%"])
    overall = sum(done) / len(done)
    build = [v for (name, v) in ACTIVITIES if name.startswith("Phase")]
    verify = [v for (name, v) in ACTIVITIES if not name.startswith("Phase")]
    ax.set_title(f"Overall: {sum(done):.1f} of {len(done)} activities = {overall:.0%} "
                 f"(build phases {sum(build):.0f} of {len(build)}; verification {sum(verify):.1f} of {len(verify)})",
                 fontsize=9, color=INK_2, loc="left")
    recessive(ax)
    save(fig, "fig22-completion-summary")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    figure20()
    figure21()
    figure22()
    print("wrote figures 20, 21, 22 to", OUT)
