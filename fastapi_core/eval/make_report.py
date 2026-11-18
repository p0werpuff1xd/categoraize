"""Build eval/RESULTS.md from the result files (Phase 7). No number is typed by hand.

    python -m eval.run_eval --split test --system all   # once
    python -m eval.make_report
"""

import json
from collections import Counter
from pathlib import Path

from .loaders import LANGUAGES, load_categories
from .run_eval import RESULTS_DIR, format_cell
from .systems import CONFIG_DIR, MODELS_DIR, SYSTEMS

REPORT = Path(__file__).resolve().parent / "RESULTS.md"
MAIN_METRICS = (
    ("category_macro_f1", "Category macro-F1"),
    ("category_accuracy", "Category accuracy"),
    ("priority_exact", "Priority exact"),
    ("priority_within1", "Priority within 1"),
    ("priority_qwk", "Priority QWK"),
    ("priority_mae", "Priority MAE (lower is better)"),
    ("register_accuracy", "Register accuracy"),
    ("register_macro_f1", "Register macro-F1"),
    ("task_f1", "TASK span F1"),
    ("date_f1", "DATE span F1"),
    ("span_micro_f1", "Span micro-F1"),
    ("date_resolution_accuracy", "Resolved-date accuracy (end to end)"),
    ("date_resolution_on_gold_spans", "Resolved-date accuracy (on gold spans)"),
    ("conflict_accuracy", "Calendar-conflict accuracy"),
)
LANGUAGE_METRICS = ("category_macro_f1", "priority_qwk", "priority_exact", "register_accuracy", "span_micro_f1",
                    "date_resolution_accuracy")


def _load(name: str) -> dict | None:
    path = RESULTS_DIR / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _json(path: Path) -> dict | None:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def comparison_table(results: dict[str, dict], scope: str, metrics) -> list[str]:
    systems = list(results)
    lines = ["| metric | " + " | ".join(systems) + " |", "|---|" + "---|" * len(systems)]
    for key, label in metrics:
        cells = [format_cell(results[s]["results"][scope]["metrics"][key]) for s in systems]
        lines.append(f"| {label} | " + " | ".join(cells) + " |")
    return lines


def confusion_lines(result: dict) -> list[str]:
    slugs = [category.slug for category in load_categories()]
    columns = [*slugs, "none"]
    lines = ["| gold \\ predicted | " + " | ".join(columns) + " |", "|---|" + "---|" * len(columns)]
    for gold in slugs:
        lines.append(f"| {gold} | " + " | ".join(str(result["confusion_matrix"][gold][c]) for c in columns) + " |")
    return lines


def worst_misses(result: dict, count: int = 10) -> list[dict]:
    def severity(row: dict) -> float:
        return (2.0 * (row["gold_category"] != row["pred_category"]) + abs(row["gold_priority"] - row["pred_priority"])
                + (row["gold_register"] != row["pred_register"]) + 0.5 * row["span_errors"]
                + 2.0 * (row["gold_conflict"] != row["pred_conflict"]))

    rows = sorted(result["per_email"], key=lambda row: (-severity(row), row["id"]))
    return [row | {"severity": round(severity(row), 1)} for row in rows[:count]]


def error_summary(result: dict) -> list[str]:
    rows = result["per_email"]
    total = len(rows)
    confusions = Counter((r["gold_category"], r["pred_category"] or "none") for r in rows
                         if r["gold_category"] != r["pred_category"])
    errors = [r["pred_priority"] - r["gold_priority"] for r in rows]
    over, under = sum(e > 0 for e in errors), sum(e < 0 for e in errors)
    by_language = {lang: [r for r in rows if r["language"] == lang] for lang in LANGUAGES}
    lines = [
        f"- Category errors: {sum(confusions.values())} of {total}. Most frequent confusions: "
        + (", ".join(f"{g} -> {p} ({n})" for (g, p), n in confusions.most_common(4)) or "none") + ".",
        f"- Priority: {over} emails predicted too high, {under} too low; mean signed error "
        f"{sum(errors) / total:+.2f} levels.",
        f"- Register errors: {sum(r['gold_register'] != r['pred_register'] for r in rows)} of {total}; "
        f"by language " + ", ".join(
            f"{lang} {sum(r['gold_register'] != r['pred_register'] for r in subset)}/{len(subset)}"
            for lang, subset in by_language.items()) + ".",
        f"- Emails with at least one span error: {sum(r['span_errors'] > 0 for r in rows)} of {total}; by language "
        + ", ".join(f"{lang} {sum(r['span_errors'] > 0 for r in subset)}/{len(subset)}"
                    for lang, subset in by_language.items()) + ".",
    ]
    return lines


def main() -> None:
    test = {system: _load(f"{system}_test.json") for system in SYSTEMS}
    missing = [system for system, result in test.items() if result is None]
    if missing:
        raise SystemExit(f"missing test results for {missing}; run: python -m eval.run_eval --split test --system all")
    dev = {system: _load(f"{system}_dev.json") for system in SYSTEMS}
    tuned = _json(CONFIG_DIR / "tuned.json")
    conflict = _json(RESULTS_DIR / "conflict_check.json")
    b4 = test["B4"]
    n = b4["results"]["overall"]["n"]

    lines = [
        "# CategorAIze evaluation results",
        "",
        "Generated by `python -m eval.make_report` from `eval/results/*.json`; every number below comes from",
        "those files. Bootstrap 95% confidence intervals in brackets (1000 resamples of emails, fixed seed).",
        "",
        "## Read this first",
        "",
        "- **Labels are AI-authored** (`human_reviewed=false` on every record). They are pending a second-labeler",
        "  Cohen's kappa check (`data/categoraize-dataset/review/second_labeler_test_BLIND.csv`) and a native",
        "  Filipino speaker review. Do not describe these results as human-labeled.",
        "- **Train is template-synthetic**, so train and dev scores overstate performance on real mail. The",
        "  hand-written test set is the number to report.",
        f"- **The test set is small** (n={n}; about a third per language), so confidence intervals are wide and",
        "  differences between systems whose intervals overlap are not established.",
        "- Dev (n=30) was used for every tuning choice and has no calendar data. Test was run once for all four",
        "  systems; after that run the register model was switched back to rules (see the decision below) and",
        "  B4 was re-run once with that setting. B1-B3 numbers are from the first and only run.",
        "- No real user mail was used anywhere (Google API Limited Use).",
        "",
        "## Systems",
        "",
        "| system | category | tagger | priority | register |",
        "|---|---|---|---|---|",
    ]
    for system, result in test.items():
        config = result["config"]
        category = {"B1": "keyword rules"}.get(system, "SBERT " + json.dumps(config.get("category_params", {})))
        lines.append(f"| {system} | {category} | {config['tagger']} | {config['priority_model']} | "
                     f"{config['register_model']} |")
    lines += ["", "## Test results, all languages", "", *comparison_table(test, "overall", MAIN_METRICS), ""]

    for language in LANGUAGES:
        n_lang = b4["results"][language]["n"]
        chosen = [(key, label) for key, label in MAIN_METRICS if key in LANGUAGE_METRICS]
        lines += [f"## Test results, {language} (n={n_lang})", "", *comparison_table(test, language, chosen), ""]

    lines += ["## Priority: learned (B4) against rules (B1, B3)", "",
              *comparison_table({s: test[s] for s in ("B1", "B3", "B4")}, "overall",
                                [m for m in MAIN_METRICS if m[0].startswith("priority")]), ""]

    lines += ["## B4 category confusion matrix (test)", "", *confusion_lines(b4), ""]

    lines += ["## Calendar conflict check (Phase 5)", "",
              "Computed deterministically from resolved DATE times and the busy intervals.", "",
              "| split | emails | with calendar | gold conflicts | match (gold dates) | match (normalizer) |",
              "|---|---|---|---|---|---|"]
    for split, counts in (conflict or {}).get("splits", {}).items():
        lines.append(f"| {split} | {counts['emails']} | {counts['with_calendar']} | {counts['gold_conflicts']} | "
                     f"{counts['accuracy_from_gold_dates']:.0%} | {counts['accuracy_from_normalizer']:.0%} |")
    lines.append("")

    lines += ["## Error analysis (B4, test)", "", *error_summary(b4), "",
              "Ten worst misses, ranked by 2 x category miss + |priority error| + register miss + 0.5 x span errors",
              "+ 2 x conflict miss (ids only; the emails are in `data/categoraize-dataset/data/test.jsonl`):", "",
              "| id | lang | category gold -> pred | priority gold -> pred | register gold -> pred | span errors | severity |",
              "|---|---|---|---|---|---|---|"]
    for row in worst_misses(b4):
        lines.append(f"| {row['id']} | {row['language']} | {row['gold_category']} -> {row['pred_category'] or 'none'} | "
                     f"{row['gold_priority']} -> {row['pred_priority']} | {row['gold_register']} -> "
                     f"{row['pred_register']} | {row['span_errors']} | {row['severity']} |")
    lines.append("")

    lines += ["## Dev scores used for the choices", ""]
    if tuned:
        lines.append(f"- Category (B3): {json.dumps(tuned['category'])}; dev macro-F1 "
                     f"{tuned['dev_scores']['chosen']['dev_macro_f1']} vs zero-shot "
                     f"{tuned['dev_scores']['zero_shot_B2']['dev_macro_f1']}.")
    for kind in ("register", "priority"):
        path = MODELS_DIR / kind / "v1" / "model.json"
        summary = _json(path)["meta"]["summary"] if path.exists() else None
        if summary:
            baseline = summary.get("rules_baseline") or summary.get("rules_baseline_B3")
            lines.append(f"- Learned {kind}: chosen {json.dumps(summary['chosen'])}; rule baseline "
                         f"{json.dumps(baseline)}; promoted: {summary['promoted']}."
                         + (f" **Decision:** {summary['decision']}" if summary.get("decision") else ""))
    tagger = _tagger_summary()
    if tagger:
        lines.append(tagger)
    lines += ["", "Dev results for every system: `eval/results/B*_dev.md`.", ""]
    if any(result is None for result in dev.values()):
        lines.append("(Some dev result files are missing.)")
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _update_tagger_card(b4)
    print(f"wrote {REPORT}")


def _tagger_summary() -> str | None:
    lines = []
    for directory in sorted((MODELS_DIR / "tagger").glob("v*")):
        metrics = _json(directory / "metrics.json")
        if metrics and "compared_with" in metrics and isinstance(metrics.get("dev"), dict) and "overall" in metrics["dev"]:
            lines.append(f"{directory.name} dev span micro-F1 {metrics['dev']['overall']['span_micro_f1']} "
                         f"(promoted: {metrics['promoted']})")
    current = _json(MODELS_DIR / "tagger" / "current.json")
    if not lines:
        return None
    return f"- Tagger: {'; '.join(lines)}. Active: {current['version'] if current else 'none'}."


def _update_tagger_card(b4: dict) -> None:
    """Record the single test run in the active tagger's metrics and card (if it was trained on this dataset)."""
    current = _json(MODELS_DIR / "tagger" / "current.json")
    if not current:
        return
    directory = MODELS_DIR / "tagger" / current["version"]
    metrics = _json(directory / "metrics.json")
    trained_here = str((metrics or {}).get("data", {}).get("train", "")).startswith("data/categoraize-dataset")
    if not trained_here:  # older versions keep their own metrics format; RESULTS.md has their test scores
        return
    keys = ("task_precision", "task_recall", "task_f1", "date_precision", "date_recall", "date_f1", "span_micro_f1")
    metrics["test"] = {scope: {key: block["metrics"][key]["value"] for key in keys}
                       for scope, block in b4["results"].items()}
    (directory / "metrics.json").write_text(json.dumps(metrics, indent=1) + "\n", encoding="utf-8")
    from .train_tagger import write_model_card

    write_model_card(directory, metrics)


if __name__ == "__main__":
    main()
