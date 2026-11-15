"""Tune and score rule matching and Reply Zero status on data/matching.

    python -m training.eval_matching            # tune on dev, write params, score dev
    python -m training.eval_matching --test     # also score the held-out test half once

Rule matching is tuned in two steps on dev only:
1. threshold and request boost: highest local accuracy;
2. confidence band and margin: highest accuracy on the emails CategorAIze
   decides by itself, while still deciding at least MIN_COVERAGE of them
   locally (the rest would go to the external LLM, if the user allowed it).
"""

import argparse
import itertools
import json
from collections import Counter, defaultdict
from dataclasses import asdict, replace
from pathlib import Path

from app.algorithms.rule_matcher import (
    PARAMS_PATH,
    PROTOTYPES_PATH,
    RuleInput,
    RuleParams,
    choose_rule,
    prototype_language,
)
from app.algorithms.thread_status import ThreadMessage, asks_question, determine_status
from app.services.embeddings import model_manager
from app.services.tagger import tagger_manager

DATA = Path(__file__).resolve().parent.parent / "data" / "matching"
LLM_DIR = Path(__file__).resolve().parent.parent / "data" / "llm"
MIN_COVERAGE = 0.75
LABEL_KINDS = {
    "To Reply": "TO_REPLY", "Newsletter": "NEWSLETTER", "Marketing": "MARKETING", "Calendar": "CALENDAR",
    "Receipt": "RECEIPT", "Notification": "NOTIFICATION", "OTP": "OTP", "NONE": "NONE",
}

# Inbox Zero's default rules (apps/web/utils/rule/consts.ts).
DEFAULT_RULES = [
    RuleInput("To Reply", "To Reply", "Emails I need to respond to: someone asked me a question or requested something from me, or I promised to send something and haven't yet", True, "TO_REPLY"),
    RuleInput("Newsletter", "Newsletter", "Newsletters: Regular content from publications, blogs, or services I've subscribed to", system_type="NEWSLETTER"),
    RuleInput("Marketing", "Marketing", "Marketing: Promotions, sales, and offers that can be safely archived. Exclude emails whose main purpose is account access, a transaction, or a service update, even if they include promotional content.", system_type="MARKETING"),
    RuleInput("Calendar", "Calendar", "Calendar: Any email related to scheduling, meeting invites, or calendar notifications", system_type="CALENDAR"),
    RuleInput("Receipt", "Receipt", "Receipts: Purchase confirmations, payment receipts, transaction records or invoices", system_type="RECEIPT"),
    RuleInput("Notification", "Notification", "Notifications: Alerts, status updates, or system messages", system_type="NOTIFICATION"),
    RuleInput("OTP", "OTP", "OTP: One-time passwords, 2FA/MFA codes, email verification codes, and magic sign-in or password-reset links.", system_type="OTP"),
]


def split(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """Alternate dev/test within each label, by file order."""
    seen: Counter = Counter()
    dev, test = [], []
    for row in rows:
        (dev if seen[row["label"]] % 2 == 0 else test).append(row)
        seen[row["label"]] += 1
    return dev, test


def load(name: str) -> list[dict]:
    return load_path(DATA / name)


def load_path(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class RuleScorer:
    def __init__(self, rows: list[dict]):
        _, tag, _ = tagger_manager.active()
        self.rows = rows
        self.vectors = [model_manager.embed_email(row["subject"], row["body"]) for row in rows]
        self.requests = [
            asks_question(row["body"]) or any(s.label == "TASK" for t in (row["subject"], row["body"]) for s in tag(t))
            for row in rows
        ]
        self.cache: dict[str, list[float]] = {}
        self.prototypes: dict[str, list[float]] = {}
        # Detected (not labeled) language, as the service would see it.
        self.languages = [prototype_language(row["subject"] + "\n" + row["body"]) for row in rows]

    def embed(self, texts: list[str]) -> list[list[float]]:
        missing = [text for text in texts if text not in self.cache]
        if missing:
            self.cache.update(zip(missing, model_manager.embed(missing)))
        return [self.cache[text] for text in texts]

    def score(self, params: RuleParams) -> dict:
        correct = confident = confident_correct = 0
        by_lang: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        errors = []
        for row, vector, has_request, language in zip(
            self.rows, self.vectors, self.requests, self.languages, strict=True
        ):
            decision = choose_rule(vector, DEFAULT_RULES, has_request=has_request, allow_multiple=False,
                                   embed=self.embed, params=params, prototypes=self.prototypes, language=language)
            predicted = decision.matched[0] if decision.matched else "NONE"
            hit = predicted == row["label"]
            correct += hit
            confident += decision.confident
            confident_correct += hit and decision.confident
            by_lang[row["lang"]][0] += hit
            by_lang[row["lang"]][1] += 1
            if not hit:
                errors.append((row["label"], predicted, decision.confident, row["subject"]))
        n = len(self.rows)
        return {
            "accuracy": round(correct / n, 4),
            "coverage": round(confident / n, 4),
            "confident_accuracy": round(confident_correct / confident, 4) if confident else 0.0,
            # If the external LLM answered every escalated email correctly:
            "cascade_upper_bound": round((confident_correct + (n - confident)) / n, 4),
            "by_language": {lang: round(hit / total, 4) for lang, (hit, total) in sorted(by_lang.items())},
            "errors": errors,
        }


def build_prototypes(scorer: RuleScorer) -> dict[str, list[float]]:
    """Rocchio-style centroid per built-in rule (and NONE) from labeled tuning emails."""
    by_key: dict[str, list[list[float]]] = defaultdict(list)
    for row, vector in zip(scorer.rows, scorer.vectors, strict=True):
        kind = LABEL_KINDS.get(row["label"])
        if kind is None:
            continue
        by_key[kind].append(vector)
        by_key[f"{kind}@{row['lang']}"].append(vector)
    prototypes = {}
    for key, vectors in by_key.items():
        mean = [sum(column) / len(vectors) for column in zip(*vectors)]
        norm = sum(value * value for value in mean) ** 0.5
        prototypes[key] = [round(value / norm, 6) for value in mean]
    return prototypes


def tune_rules(scorer: RuleScorer) -> RuleParams:
    best_params, best = RuleParams(), None
    for threshold, boost, floor in itertools.product(
        [0.30, 0.325, 0.35, 0.375, 0.40, 0.425, 0.45, 0.475, 0.50],
        [0.0, 0.05, 0.10, 0.15, 0.20],
        [0.0, 0.02, 0.05, 0.10, 0.15],
    ):
        params = replace(RuleParams(), threshold=threshold, request_boost=boost, request_floor=floor)
        result = scorer.score(params)
        key = (result["accuracy"], -abs(threshold - 0.35), -boost - floor)
        if best is None or key > best:
            best, best_params = key, params

    best_conf = None
    for band, margin in itertools.product([0.0, 0.01, 0.02, 0.03, 0.04, 0.06], [0.0, 0.01, 0.02, 0.03, 0.04, 0.06, 0.08]):
        params = replace(best_params, confident_band=band, confident_margin=margin)
        result = scorer.score(params)
        if result["coverage"] < MIN_COVERAGE:
            continue
        key = (result["confident_accuracy"], result["coverage"])
        if best_conf is None or key > best_conf[0]:
            best_conf = (key, params)
    return best_conf[1] if best_conf else best_params


def score_threads(rows: list[dict]) -> dict:
    _, tag, _ = tagger_manager.active()
    correct = confident = confident_correct = 0
    errors = []
    for row in rows:
        messages = [ThreadMessage(m["from_user"], m.get("subject", ""), m["body"]) for m in row["messages"]]
        decision = determine_status(messages, tag)
        hit = decision.status == row["label"]
        correct += hit
        confident += decision.confident
        confident_correct += hit and decision.confident
        if not hit:
            errors.append((row["label"], decision.status, decision.confident, row["messages"][-1]["body"]))
    n = len(rows)
    return {
        "accuracy": round(correct / n, 4),
        "coverage": round(confident / n, 4),
        "confident_accuracy": round(confident_correct / confident, 4) if confident else 0.0,
        "cascade_upper_bound": round((confident_correct + (n - confident)) / n, 4),
        "errors": errors,
    }


def report(name: str, result: dict) -> None:
    print(f"{name}: accuracy {result['accuracy']:.3f}, decided locally {result['coverage']:.0%} "
          f"with accuracy {result['confident_accuracy']:.3f}, cascade upper bound {result['cascade_upper_bound']:.3f}"
          + (f", by language {result['by_language']}" if "by_language" in result else ""))
    for error in result["errors"]:
        print(f"   miss: want {error[0]:<14} got {error[1]:<14} confident={error[2]!s:<5} | {error[3][:70]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--test", action="store_true", help="score the held-out test half once")
    args = parser.parse_args()

    model_manager.load()
    llm_rules, llm_threads = LLM_DIR / "rules.jsonl", LLM_DIR / "threads.jsonl"
    if llm_rules.exists() and llm_threads.exists():
        # Tune on 80% of the LLM-written sets; the other 20% is an LLM holdout.
        # The hand-written sets (a different author) are the test, in full.
        rules_llm, threads_llm = load_path(llm_rules), load_path(llm_threads)
        rule_dev = [row for index, row in enumerate(rules_llm) if index % 5]
        thread_dev = [row for index, row in enumerate(threads_llm) if index % 5]
        extra_holdouts = {
            "Rules (LLM holdout)": [row for index, row in enumerate(rules_llm) if not index % 5],
            "Threads (LLM holdout)": [row for index, row in enumerate(threads_llm) if not index % 5],
        }
        rule_test, thread_test = load("rules.jsonl"), load("threads.jsonl")
        print(f"tuning on {len(rule_dev)} LLM rule emails and {len(thread_dev)} LLM threads; "
              f"testing on {len(rule_test)} hand-written emails and {len(thread_test)} threads")
    else:
        rule_dev, rule_test = split(load("rules.jsonl"))
        thread_dev, thread_test = split(load("threads.jsonl"))
        extra_holdouts = {}

    dev_scorer = RuleScorer(rule_dev)
    report("Rules, default settings, descriptions only (dev)", dev_scorer.score(RuleParams()))
    prototypes = build_prototypes(dev_scorer) if extra_holdouts else {}
    dev_scorer.prototypes = prototypes
    if prototypes:
        report("Rules, default settings, with learned prototypes (dev)", dev_scorer.score(RuleParams()))
    params = tune_rules(dev_scorer)
    dev_result = dev_scorer.score(params)
    print(f"\nTuned settings: {asdict(params)}")
    report("Rules, tuned (dev)", dev_result)
    report("Threads (dev)", score_threads(thread_dev))

    output = {"rules": asdict(params), "tuned_on": "data/matching dev half",
              "dev": {"rules": {k: v for k, v in dev_result.items() if k != "errors"}}}
    if args.test:
        test_scorer = RuleScorer(rule_test)
        if prototypes:
            report("Rules, descriptions only (TEST, ablation)", {**test_scorer.score(params), "errors": []})
        test_scorer.prototypes = prototypes
        test_rules = test_scorer.score(params)
        test_threads = score_threads(thread_test)
        print()
        for name, rows in extra_holdouts.items():
            if name.startswith("Rules"):
                holdout_scorer = RuleScorer(rows)
                holdout_scorer.prototypes = prototypes
                result = holdout_scorer.score(params)
            else:
                result = score_threads(rows)
            result["errors"] = []
            report(name, result)
            output.setdefault("llm_holdout", {})[name] = result
        report("Rules (TEST, scored once)", test_rules)
        report("Threads (TEST, scored once)", test_threads)
        output["test"] = {"rules": {k: v for k, v in test_rules.items() if k != "errors"},
                          "threads": {k: v for k, v in test_threads.items() if k != "errors"}}
    PARAMS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if prototypes:
        PROTOTYPES_PATH.write_text(
            json.dumps({"built_from": f"{len(rule_dev)} LLM-written rule emails (tuning split)",
                        "prototypes": prototypes}) + "\n",
            encoding="utf-8",
        )
    PARAMS_PATH.write_text(json.dumps(output, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {PARAMS_PATH}")


if __name__ == "__main__":
    main()
