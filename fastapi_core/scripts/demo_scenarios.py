"""Live demo of the five acceptance scenarios against the running NLP service.

Usage (from the repo root, service running on port 8000):
    fastapi_core\\.venv\\Scripts\\python.exe fastapi_core\\scripts\\demo_scenarios.py

Uses only the standard library. The internal key comes from the
CATEGORAIZE_INTERNAL_KEY environment variable, or else from apps/web/.env; it
is never printed. Exit code 0 when every scenario passes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
RECEIVED_AT = "2026-11-09T09:00:00+08:00"  # a Monday morning in Manila
TIMEZONE = "Asia/Manila"

CATEGORIES = [
    {
        "id": "school",
        "name": "School",
        "description": "University coursework: classes, assignments, exams, grades, professors and thesis.",
        "base_priority": 3,
    },
    {
        "id": "bills",
        "name": "Bills and Payments",
        "description": "Bills and utility statements (electricity, water, internet), credit card statements, invoices, receipts, amounts due and payment confirmations.",
        "base_priority": 3,
    },
    {
        "id": "orders",
        "name": "Orders",
        "description": "Online shopping order confirmations, shipping updates and package delivery tracking.",
        "base_priority": 2,
    },
]

GREEN, RED, DIM, BOLD, RESET = "\033[32m", "\033[31m", "\033[2m", "\033[1m", "\033[0m"


def read_key() -> str:
    key = os.environ.get("CATEGORAIZE_INTERNAL_KEY", "").strip()
    if key:
        return key
    env_file = REPO_ROOT / "apps" / "web" / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("CATEGORAIZE_INTERNAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit(
        "CATEGORAIZE_INTERNAL_KEY is not set and apps/web/.env has no value for it. "
        "Set it to the same value the service was started with."
    )


class Service:
    def __init__(self, base_url: str, key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.key = key

    def get(self, path: str) -> dict:
        with urllib.request.urlopen(self.base_url + path, timeout=10) as response:
            return json.load(response)

    def post(self, path: str, payload: dict) -> dict:
        request = urllib.request.Request(
            self.base_url + path,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-Internal-Key": self.key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:300]
            raise SystemExit(f"{path} returned {error.code}: {detail}") from error

    def classify(self, subject: str, body: str, categories=None, **extra) -> dict:
        payload = {
            "email_id": "demo",
            "subject": subject,
            "body": body,
            "received_at": RECEIVED_AT,
            "timezone": TIMEZONE,
            "now": RECEIVED_AT,
            "categories": CATEGORIES if categories is None else categories,
            "threshold": 0.35,
        }
        payload.update(extra)
        return self.post("/api/v1/classify", payload)


def ranked(result: dict, names: dict[str, str]) -> str:
    return ", ".join(f"{names.get(item['id'], item['id'])} {item['similarity']:.2f}" for item in result["ranked"])


def show(label: str, value: object) -> None:
    print(f"   {DIM}{label:<11}{RESET} {value}")


def scenario_1(service: Service) -> bool:
    names = {c["id"]: c["name"] for c in CATEGORIES}
    cases = [
        ("Midterm exam schedule", "Good morning class, the midterm exam for Data Structures will be on Thursday. Review chapters 4 to 6.", "school"),
        ("Naipadala na ang order mo", "Ang iyong package ay nasa delivery hub na at darating bukas. Tracking number: SPX123456.", "orders"),
    ]
    ok = True
    for subject, body, expected in cases:
        result = service.classify(subject, body)
        got = result["category"]["id"] if result["category"] else None
        show("email", f'"{subject}" ({result["language"]})')
        show("ranked", ranked(result, names))
        show("label", f"{names.get(got, 'Uncategorized')} (expected {names[expected]})")
        ok &= got == expected
    return ok


def scenario_2(service: Service) -> bool:
    result = service.classify(
        "Interview invitation: Junior Software Engineer",
        "Thank you for applying to our company. We would like to invite you to a job interview "
        "with our hiring manager. Please confirm your availability for this week.",
    )
    suggestion = result["suggested_label"]
    show("email", '"Interview invitation: Junior Software Engineer"')
    show("label", "Uncategorized" if result["category"] is None else result["category"]["id"])
    show("suggestion", f'{suggestion["name"]} ({suggestion["similarity"]:.2f}), created only if the user clicks' if suggestion else None)
    return result["category"] is None and bool(suggestion) and suggestion["name"] == "Jobs"


def scenario_3(service: Service) -> bool:
    body = "Hi team, paki-send ang final weekly report bukas. Salamat!"
    result = service.classify("", body)
    show("email", f'"{body}" (received Mon 9 Nov 09:00 Manila)')
    for span in result["spans"]:
        resolved = f' -> {span["resolved"]}' if span.get("resolved") else ""
        flags = " (deadline)" if span["is_deadline"] else ""
        show(span["label"], f'"{span["text"]}"{resolved}{flags} [{span["tagger"]}]')
    task = any(span["label"] == "TASK" for span in result["spans"])
    date = next((span for span in result["spans"] if span["label"] == "DATE" and span["text"].lower() == "bukas"), None)
    return task and bool(date) and date["is_deadline"] and str(date["resolved"]).startswith("2026-11-10T17:00")


def scenario_4(service: Service) -> bool:
    plain = service.classify("Quarterly report", "Please submit the quarterly report.")["priority"]
    urgent = service.classify("Quarterly report", "Please submit the quarterly report tomorrow.")["priority"]
    # Same email, plus a busy calendar block around tomorrow 17:00.
    busy = [{"start": "2026-11-10T16:00:00+08:00", "end": "2026-11-10T18:00:00+08:00"}]
    booked = service.classify("Quarterly report", "Please submit the quarterly report tomorrow.", calendar_busy=busy)["priority"]

    def line(priority: dict) -> str:
        factors = ", ".join(f"{key} {value:+d}" if key != "category_base" else f"base {value}" for key, value in priority["factors"].items())
        return f'P{priority["level"]}  ({factors})'

    show("no date", line(plain))
    show("tomorrow", line(urgent))
    show("+ busy", line(booked) + "  <- calendar busy at the deadline")
    return (
        urgent["level"] > plain["level"]
        and urgent["factors"]["deadline"] > 0
        and booked["factors"]["calendar"] == 1
        and booked["level"] >= urgent["level"]
    )


def scenario_5(service: Service) -> bool:
    categories = [
        {"id": "school", "name": "School", "description": "University classes, enrollment, professors and coursework."},
        {"id": "money", "name": "Bills and Payments", "description": "Bills, fees, invoices and payments."},
    ]
    names = {c["id"]: c["name"] for c in categories}
    vectors = service.post("/api/v1/embed", {"texts": [f'{c["name"]}: {c["description"]}' for c in categories]})["vectors"]
    for category, vector in zip(categories, vectors):
        category["centroid"] = vector

    corrected = ("Tuition payment", "Paki-settle naman ang tuition fee balance para sa second semester bago ang enrollment.")
    later = ("Tuition reminder", "Reminder: the remaining tuition fee for the semester must be paid at the cashier.")

    before = service.classify(*later, categories=categories)
    wrong, right = before["ranked"][0]["id"], before["ranked"][1]["id"]
    show("before", ranked(before, names))

    embedding = service.classify(*corrected, categories=categories)["embedding"]
    by_id = {c["id"]: c for c in categories}
    for _ in range(3):
        update = service.post(
            "/api/v1/feedback",
            {
                "embedding": embedding,
                "correct": {"id": right, "centroid": by_id[right]["centroid"]},
                "incorrect": {"id": wrong, "centroid": by_id[wrong]["centroid"]},
            },
        )
        by_id[right]["centroid"] = update["correct"]["centroid"]
        by_id[wrong]["centroid"] = update["incorrect"]["centroid"]
    show("feedback", f'"{corrected[0]}" corrected from {names[wrong]} to {names[right]} (Rocchio, 3 times)')

    after = service.classify(*later, categories=categories)
    show("after", ranked(after, names))
    return after["ranked"][0]["id"] == right


SCENARIOS = [
    ("1. An existing label is selected by Sentence-BERT", scenario_1),
    ("2. An unmatched email gets a suggested label that needs approval", scenario_2),
    ('3. Taglish "bukas" gives a TASK span, a DATE span and a deadline', scenario_3),
    ("4. A near-term deadline raises priority, with the factor breakdown", scenario_4),
    ("5. A correction moves the Rocchio centroid and changes later results", scenario_5),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=os.environ.get("CATEGORAIZE_SERVICE_URL", "http://127.0.0.1:8000"))
    args = parser.parse_args()
    if os.name == "nt":
        os.system("")  # enables ANSI colors in Windows terminals

    service = Service(args.url, read_key())
    try:
        health = service.get("/healthz")
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"{RED}The NLP service is not reachable at {args.url} ({error}).{RESET}")
        print("Start it first: scripts\\categoraize\\start.ps1 (or see README).")
        return 2
    tagger = health.get("tagger", {})
    print(f"{BOLD}CategorAIze acceptance scenarios{RESET}  service {args.url}, tagger {tagger.get('name', '?')} {tagger.get('version', '')}\n")

    results = []
    for title, run in SCENARIOS:
        print(f"{BOLD}{title}{RESET}")
        passed = run(service)
        results.append(passed)
        print(f"   {GREEN + 'PASS' if passed else RED + 'FAIL'}{RESET}\n")

    total = sum(results)
    colour = GREEN if total == len(results) else RED
    print(f"{colour}{BOLD}{total}/{len(results)} scenarios passed{RESET}")
    return 0 if total == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
