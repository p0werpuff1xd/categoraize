"""Train the learned register and priority models (Phase 4).

    python -m eval.train_models

Fit on train only; pick the L2 strength C on dev; never read test. Register
goes first because its prediction is a priority feature.

- Register: logistic regression on the 384-d email embedding plus the rule
  cues (po/opo, Dear/Kindly, emoji, lowercase starts, slang, exclamations).
  Selection: dev macro-F1, then accuracy, then the smaller C.
- Priority: logistic regression on [embedding, role one-hot, is_vip,
  has_task, deadline proximity, promotion similarity, register]. Train
  features come from gold spans and gold register; dev features come from
  the predicted pipeline (active tagger, learned register, B3 category), so
  the C choice reflects serving conditions. Guardrails (VIP floor with a
  task, promotion cap) are applied before scoring. Selection: dev quadratic
  weighted kappa, then exact accuracy, then the smaller C.

A model becomes current only if its dev score is not below the rule
baseline. Weights are saved as JSON (inspectable, no pickle).
"""

import argparse
import json
from datetime import UTC, datetime

import numpy as np
from sklearn.linear_model import LogisticRegression

from app.ml import priority_model
from app.ml.linear import LinearModel
from app.nlp import register as register_nlp
from app.services.embeddings import MODEL_NAME

from .loaders import Record, load_split
from .metrics import PredictedSpan, macro_f1, quadratic_kappa
from .systems import MODELS_DIR, CategoryParams, Context, load_tuned

C_GRID = (0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
SEED = 7
VERSION = "v1"


def fit(features: list[list[float]], labels: list, c: float) -> LogisticRegression:
    model = LogisticRegression(C=c, max_iter=5000, random_state=SEED)
    model.fit(np.asarray(features), np.asarray(labels))
    return model


def to_linear(model: LogisticRegression, names: list[str], meta: dict) -> LinearModel:
    classes = [c.item() if hasattr(c, "item") else c for c in model.classes_]
    coef, intercept = model.coef_.tolist(), model.intercept_.tolist()
    if len(classes) == 2:  # sklearn stores one row for binary problems
        coef, intercept = [[0.0] * len(coef[0]), coef[0]], [0.0, intercept[0]]
    return LinearModel(classes, names, coef, intercept, meta)


def gold_spans(record: Record) -> list[PredictedSpan]:
    return [PredictedSpan(span.label, span.start, span.end, span.resolved, span.ambiguous) for span in record.gold_spans]


def train_register(context: Context, train: list[Record], dev: list[Record]) -> tuple[LinearModel, dict]:
    def rows(records):
        return [register_nlp.learned_features(context.embedding(r), register_nlp.cue_features(r.subject, r.body))
                for r in records]

    x_train, y_train = rows(train), [r.gold_register for r in train]
    x_dev, y_dev = rows(dev), [r.gold_register for r in dev]
    names = register_nlp.feature_names(len(context.embedding(train[0])))
    trials = []
    for c in C_GRID:
        predicted = list(fit(x_train, y_train, c).predict(np.asarray(x_dev)))
        trials.append({"C": c, "dev_macro_f1": round(macro_f1(y_dev, predicted), 4),
                       "dev_accuracy": round(float(np.mean([g == p for g, p in zip(y_dev, predicted, strict=True)])), 4)})
    best = sorted(trials, key=lambda t: (-t["dev_macro_f1"], -t["dev_accuracy"], t["C"]))[0]
    rules = [register_nlp.rule_register(register_nlp.cue_features(r.subject, r.body)) for r in dev]
    baseline = {"dev_macro_f1": round(macro_f1(y_dev, rules), 4),
                "dev_accuracy": round(float(np.mean([g == p for g, p in zip(y_dev, rules, strict=True)])), 4)}
    model = to_linear(fit(x_train, y_train, best["C"]), names, {})
    summary = {"chosen": best, "rules_baseline": baseline, "grid": trials,
               "promoted": best["dev_macro_f1"] >= baseline["dev_macro_f1"]}
    return model, summary


def train_priority(context: Context, register_model: LinearModel | None, train: list[Record], dev: list[Record]):
    x_train = [context.priority_features(r, gold_spans(r), r.gold_register) for r in train]
    y_train = [r.gold_priority for r in train]
    params = load_tuned() or CategoryParams()

    dev_rows = []
    for record in dev:
        spans = context.crf_spans(record)
        register = register_nlp.detect_register(record.subject, record.body, embedding=context.embedding(record),
                                                 model=register_model).register
        category, _ = context.sbert_category(record, params)
        dev_rows.append((record, spans, category, context.priority_features(record, spans, register)))
    y_dev = [record.gold_priority for record, *_ in dev_rows]
    names = priority_model.feature_names(len(context.embedding(train[0])))
    meta = {"promo_vector": [round(v, 6) for v in context.description_vectors["promotions"]]}

    trials = []
    for c in C_GRID:
        candidate = to_linear(fit(x_train, y_train, c), names, meta)
        predicted = [priority_model.predict(candidate, features, is_vip=record.is_vip,
                                            has_task=any(s.label == "TASK" for s in spans), category=category).level
                     for record, spans, category, features in dev_rows]
        trials.append(_priority_scores(c, y_dev, predicted))
    best = sorted(trials, key=lambda t: (-t["dev_qwk"], -t["dev_exact"], t["C"]))[0]
    rules = [context.rule_priority(record, category, spans) for record, spans, category, _ in dev_rows]
    baseline = _priority_scores(None, y_dev, rules)
    model = to_linear(fit(x_train, y_train, best["C"]), names, meta)
    summary = {"chosen": best, "rules_baseline_B3": baseline, "grid": trials,
               "promoted": best["dev_qwk"] >= baseline["dev_qwk"]}
    return model, summary


def _priority_scores(c, gold: list[int], predicted: list[int]) -> dict:
    return {"C": c, "dev_qwk": round(quadratic_kappa(gold, predicted), 4),
            "dev_exact": round(float(np.mean([g == p for g, p in zip(gold, predicted, strict=True)])), 4),
            "dev_within1": round(float(np.mean([abs(g - p) <= 1 for g, p in zip(gold, predicted, strict=True)])), 4),
            "dev_mae": round(float(np.mean([abs(g - p) for g, p in zip(gold, predicted, strict=True)])), 4)}


def save(kind: str, model: LinearModel, summary: dict, extra_meta: dict) -> None:
    directory = MODELS_DIR / kind / VERSION
    meta = {**model.meta, **extra_meta, "version": VERSION, "summary": summary}
    LinearModel(model.classes, model.feature_names, model.coef, model.intercept, meta).save(directory / "model.json")
    (directory / "MODEL_CARD.md").write_text(model_card(kind, summary, extra_meta), encoding="utf-8")
    pointer = MODELS_DIR / kind / "current.json"
    if summary["promoted"]:
        pointer.write_text(json.dumps({"version": VERSION}) + "\n", encoding="utf-8")
    elif pointer.exists():
        pointer.unlink()


def model_card(kind: str, summary: dict, meta: dict) -> str:
    chosen = summary["chosen"]
    baseline = summary.get("rules_baseline") or summary.get("rules_baseline_B3")
    metric_keys = [key for key in chosen if key != "C"]
    return "\n".join([
        f"# Learned {kind} {VERSION} model card",
        "",
        f"Multinomial logistic regression (scikit-learn, L2), stored as JSON in `model.json`. {meta['features']}",
        "",
        "## Data",
        "",
        "- Fit: data/categoraize-dataset/data/train.jsonl (300, template-synthetic). C chosen on dev.jsonl (30).",
        "- Fictional emails only; never trained on real users' mail (Google Limited Use).",
        "- Labels are AI-authored (`human_reviewed=false`), pending second-labeler kappa and native-speaker review.",
        "- Train is template-synthetic: priority and register are fixed per template, so the model can learn",
        "  template shortcuts; dev/test scores overstate real-mail performance.",
        "",
        f"## Dev selection (seed {SEED}, embedding {MODEL_NAME})",
        "",
        "| C | " + " | ".join(metric_keys) + " |",
        "|---|" + "---|" * len(metric_keys),
        *(f"| {t['C']} | " + " | ".join(str(t[k]) for k in metric_keys) + " |" for t in summary["grid"]),
        "",
        f"Chosen C = {chosen['C']}. Rule baseline on dev: "
        + ", ".join(f"{k} {baseline[k]}" for k in metric_keys) + ".",
        f"Promoted to current: **{'yes' if summary['promoted'] else 'no'}** (rule: not below the rule baseline on dev).",
        *([f"Decision: {summary['decision']}"] if summary.get("decision") else []),
        "",
        "## Guardrails and fallback",
        "",
        meta["guardrails"],
        "",
        "Test results: see eval/RESULTS.md (B4).",
        "",
    ])


REGISTER_DECISION = (
    "Kept on rules. The learned model's dev gain was one email of 30 (macro-F1 0.813 vs 0.769), and the "
    "first test run showed rules ahead (accuracy 0.85 vs 0.78). This choice used test information, so the "
    "register test numbers in RESULTS.md are no longer a clean held-out estimate."
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--register-rules", action="store_true",
                        help="save the learned register model but serve the rule detector")
    args = parser.parse_args()
    context = Context()
    train, dev = load_split("train"), load_split("dev")
    context.warm(train + dev)

    register_lm, register_summary = train_register(context, train, dev)
    if args.register_rules:
        register_summary["promoted"], register_summary["decision"] = False, REGISTER_DECISION
    save("register", register_lm, register_summary, {
        "features": "Features: the 384-d email embedding and the rule cues " + ", ".join(register_nlp.CUE_FEATURES) + ".",
        "guardrails": "When the model file is missing the service uses the rule cue detector (app/nlp/register.py).",
    })
    active_register = register_lm if register_summary["promoted"] else None

    priority_lm, priority_summary = train_priority(context, active_register, train, dev)
    save("priority", priority_lm, priority_summary, {
        "features": "Features: embedding, sender role (one-hot), is_vip, has_task, deadline proximity (0 if none or "
                    "ambiguous, 1 if due now, 0 at one week), similarity to the promotions description, register.",
        "guardrails": "After the model: a VIP sender with a TASK is at least P4; promotions are capped at P2; a manual "
                      "override wins. Calendar data is not a feature, so it never lowers priority. Without the model "
                      "file the service uses the deterministic rules (app/ml/priority_rules.py).",
    })
    print(json.dumps({"generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
                      "register": {k: register_summary[k] for k in ("chosen", "rules_baseline", "promoted")},
                      "priority": {k: priority_summary[k] for k in ("chosen", "rules_baseline_B3", "promoted")}},
                     indent=1))


if __name__ == "__main__":
    main()
