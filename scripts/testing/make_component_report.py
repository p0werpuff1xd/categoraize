"""Build docs/testing/component_tests.md and traceability.csv from real test runs.

Inputs (written by scripts/testing/run-component-tests.ps1):
  docs/testing/results/pytest.xml      NLP service, JUnit XML with case properties
  docs/testing/results/vitest.xml      web logic, JUnit XML
  docs/testing/results/db-*.txt        psql output of the rolled-back DB tests
  docs/testing/coverage/nlp/coverage.xml and coverage/web/coverage-summary.json

Nothing in the result tables is typed by hand: every row comes from those files.
Usage:  python scripts/testing/make_component_report.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs" / "testing"
RESULTS = DOCS / "results"

COMPONENTS = {
    1: "Language detection and normalizer",
    2: "Category classifier (zero-shot SBERT, threshold 0.35)",
    3: "Date normalizer and resolver",
    4: "Bi-LSTM-CRF tagger",
    5: "Priority model and guardrails",
    6: "Register classifier",
    7: "Calendar conflict",
    8: "Rocchio feedback (alpha 0.20, beta 0.15)",
    9: "Discovery (clustering)",
    10: "API layer",
    11: "Web app logic",
    12: "IAS: RLS, export/erasure, backup/restore",
}

# Requirement id, text, and a rule that picks its test cases (by case id or source file).
REQUIREMENTS: list[tuple[str, str, str]] = [
    ("R-01.1", "Detect en / tl / mixed / unknown", r"^C1-0\d"),
    ("R-01.2", "Normalize Filipino particles, paki- and time words", r"^C1-1\d"),
    ("R-02.1", "Rank the right category first, every category x language", r"^C2-(0\d|1\d|2[0-4])"),
    ("R-02.2", "Accept at score >= 0.35, else uncategorized; stable ties", r"^C2-2[5-7]"),
    ("R-02.3", "Survive empty, long, HTML-only, unknown-language and oversize input", r"^C2-(2[89]|3\d)"),
    ("R-03.1", "Resolve Filipino/English date phrases incl. rollover and midnight", r"^C3-(0\d|1\d|2[015])"),
    ("R-03.2", "Manila time; an ambiguous date never counts as a conflict", r"^C3-2[2-4]"),
    ("R-04.1", "BIO round trip, adjacent/overlapping spans, no-span email", r"^C4-0[1-6]"),
    ("R-04.2", "Dev span F1 reproduces; tagging and training are deterministic", r"^C4-(0[7-9]|1\d)"),
    ("R-05.1", "Priority model P1-P5 with guardrails (VIP floor, promo cap, override)", r"^C5-"),
    ("R-06.1", "Register formal / neutral / casual in en, mixed, tl", r"^C6-"),
    ("R-07.1", "Busy periods [start, end): inclusive start, exclusive end, timezone, missing data", r"^C7-"),
    ("R-08.1", "Rocchio update matches the hand-computed example; unit norms; per-user isolation", r"^C8-"),
    ("R-09.1", "Discovery takes ids and vectors only and is deterministic", r"^C9-"),
    ("R-10.1", "Every endpoint rejects a missing or wrong key (401)", r"^C10-[AB]"),
    ("R-10.2", "Malformed input is rejected (422)", r"^C10-C"),
    ("R-10.3", "No email content in logs; stateless; health check leaks nothing", r"^C10-D"),
    ("R-11.1", "Priority badge P1-P5 text and states", r"^C11-(1[89]|2[0-3])"),
    ("R-11.2", "Filter and sort by priority", r"^C11-0\d"),
    ("R-11.3", "Feedback buttons: idle, saving, saved, error, offline", r"^C11-1[0-7]"),
    ("R-11.4", "Consent gate and external-AI opt-out", r"^C11-(CON|OPT)"),
    ("R-11.5", "PII masking helper", r"^C11-PII"),
    ("R-11.6", "AES-256-GCM field encryption round trip and tamper detection", r"^C11-ENC"),
    ("R-11.7", "Audit-log writer keeps ids only", r"^C11-AUD"),
    ("R-12.1", "RLS: tenant A cannot read or change tenant B rows", r"^C12-RLS"),
    ("R-12.2", "Data export is complete, idempotent and leaves secrets out", r"^C12-1\d"),
    ("R-12.3", "Erasure is complete and idempotent; token revocation", r"^C12-(2\d|DEL|REV)"),
    ("R-12.4", "Backup restore dry run and tamper refusal", r"^C12-3\d"),
]

# Older web tests that predate the C11/C12 ids: their file gives the prefix.
LEGACY_PREFIX = {
    "consent.test.ts": "C11-CON",
    "features.test.ts": "C11-OPT",
    "pii.test.ts": "C11-PII",
    "field-encryption.test.ts": "C11-ENC",
    "audit.test.ts": "C11-AUD",
    "data-export.test.ts": "C12-1",  # numbered after the C12-1x cases
    "delete.test.ts": "C12-DEL",
    "revoke-tokens.test.ts": "C12-REV",
}

ID_RE = re.compile(r"\bC\d{1,2}-[A-Z]{0,3}\d{2}\b")


ENTITY = re.compile(r"#x([0-9A-Fa-f]{2,6})")


def clip(text: str, n: int = 90) -> str:
    # pytest's xunit1 writer escapes emoji as "#x1F64F": put them back.
    text = ENTITY.sub(lambda m: chr(int(m.group(1), 16)), str(text))
    text = " ".join(text.split()).replace("|", "\\|")
    return text if len(text) <= n else text[: n - 1] + "…"


def component_of(case_id: str) -> int:
    return int(case_id.split("-")[0][1:])


def outcome(tc: ET.Element) -> tuple[str, str]:
    failure = tc.find("failure")
    if failure is None:
        failure = tc.find("error")
    if failure is not None:
        return "FAIL", failure.get("message") or (failure.text or "")[:200]
    skipped = tc.find("skipped")
    if skipped is not None:
        message = skipped.get("message") or ""
        if skipped.get("type") == "pytest.xfail" or message.startswith("xfail") or "D-" in message:
            defect = re.search(r"D-\d{2}", message)
            return "XFAIL", f"known defect {defect.group(0)}" if defect else message
        return "SKIP", message
    return "PASS", ""


def read_pytest(path: Path) -> list[dict]:
    rows = []
    for tc in ET.parse(path).getroot().iter("testcase"):
        props = {p.get("name"): p.get("value") for p in tc.iter("property")}
        name = tc.get("name", "")
        match = ID_RE.search(props.get("tc_id", "")) or ID_RE.search(name)
        if not match:
            continue  # the older service tests have their own report
        result, note = outcome(tc)
        title = name.split("[", 1)[1].rstrip("]") if "[" in name else name
        title = title.replace(match.group(0), "").strip(" -")
        rows.append({
            "id": match.group(0),
            "title": title or name,
            "source": f"fastapi_core/{tc.get('classname', '').replace('.', '/')}.py",
            "input": props.get("input", ""),
            "expected": props.get("expected", ""),
            "actual": props.get("actual", "") if result != "FAIL" else note,
            "result": result,
            "note": note,
        })
    return rows


def read_vitest(path: Path) -> list[dict]:
    rows = []
    legacy_seq: Counter = Counter()
    for tc in ET.parse(path).getroot().iter("testcase"):
        name = tc.get("name", "")
        source = tc.get("classname", "")
        file = Path(source).name
        match = ID_RE.search(name)
        if match:
            case_id = match.group(0)
            # it.each repeats one id: number the repeats a, b, c...
        elif file in LEGACY_PREFIX:
            prefix = LEGACY_PREFIX[file]
            legacy_seq[prefix] += 1
            if prefix == "C12-1":  # after the new C12-10..12 export cases
                case_id = f"C12-1{legacy_seq[prefix] + 2}"
            else:
                case_id = f"{prefix}{legacy_seq[prefix]:02d}"
        else:
            continue
        result, note = outcome(tc)
        title = name.split(" > ")[-1].replace(case_id, "").strip(" -")
        rows.append({
            "id": case_id,
            "title": title,
            "source": f"apps/web/{source}" if not source.startswith("apps/") else source,
            "input": "fixture in the test source",
            "expected": title,
            "actual": "as expected" if result == "PASS" else note,
            "result": result,
            "note": note,
        })
    # Disambiguate parameterized repeats (C11-06 x5, C11-18 x5).
    seen: Counter = Counter(r["id"] for r in rows)
    index: Counter = Counter()
    for r in rows:
        if seen[r["id"]] > 1:
            index[r["id"]] += 1
            r["id"] = f"{r['id']}{'abcdefghij'[index[r['id']] - 1]}"
    return rows


DB_LINE = re.compile(r"^(PASS|FAIL)\s+(.*)$")


def read_db(path: Path, prefix: str) -> list[dict]:
    rows = []
    n = 1
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = DB_LINE.match(line.strip())
        if not m:
            continue
        result, text = m.groups()
        idm = ID_RE.search(text)
        if idm:
            case_id = idm.group(0)
            text = text.replace(case_id, "").strip()
        else:
            case_id = f"{prefix}{n:02d}"
            n += 1
        rows.append({
            "id": case_id,
            "title": text,
            "source": f"scripts/db/{path.stem.replace('db-', 'test-')}.sql" if path.stem.startswith("db-") else str(path.name),
            "input": "rolled-back transaction on the local database",
            "expected": "PASS",
            "actual": text,
            "result": result,
            "note": "",
        })
    return rows


def coverage_lines() -> list[str]:
    lines = []
    nlp = DOCS / "coverage" / "nlp" / "coverage.xml"
    if nlp.exists():
        root = ET.parse(nlp).getroot()
        lines.append(f"| NLP service `fastapi_core/app` (pytest-cov) | {float(root.get('line-rate', 0)) * 100:.1f}% | 80% |")
    web = DOCS / "coverage" / "web" / "coverage-summary.json"
    if web.exists():
        total = json.loads(web.read_text())["total"]
        lines.append(f"| New web logic (Vitest v8) | {total['lines']['pct']:.1f}% | 70% |")
    return lines


def main() -> int:
    rows: list[dict] = []
    for name, reader in (("pytest.xml", read_pytest), ("vitest.xml", read_vitest)):
        path = RESULTS / name
        if path.exists():
            rows += reader(path)
        else:
            print(f"missing {path}", file=sys.stderr)
    rows += read_db(RESULTS / "db-rls.txt", "C12-RLS") if (RESULTS / "db-rls.txt").exists() else []
    rows += read_db(RESULTS / "db-erasure.txt", "C12-ERA") if (RESULTS / "db-erasure.txt").exists() else []
    rows += read_db(RESULTS / "db-restore.txt", "C12-RST") if (RESULTS / "db-restore.txt").exists() else []

    def sort_key(r: dict):
        parts = re.match(r"C(\d+)-([A-Z]*)(\d+)(.*)", r["id"])
        return (int(parts.group(1)), parts.group(2), int(parts.group(3)), parts.group(4)) if parts else (99, r["id"], 0, "")

    rows.sort(key=sort_key)
    by_component: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        by_component[component_of(r["id"])].append(r)

    totals = Counter(r["result"] for r in rows)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = [
        "# Component (unit) test results",
        "",
        f"Generated {stamp} by `scripts/testing/make_component_report.py` from the JUnit XML and psql output",
        "in `docs/testing/results/`. Do not edit by hand: rerun `scripts/testing/run-component-tests.ps1`.",
        "",
        "XFAIL = a strict expected failure tied to an open defect in `defects.md`; it turns into a FAIL",
        "if the code starts passing, so the defect list cannot go stale.",
        "",
        "## Totals",
        "",
        "| Component | Cases | Pass | Fail | XFAIL (known defect) | Skip |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for c in sorted(COMPONENTS):
        cnt = Counter(r["result"] for r in by_component.get(c, []))
        out.append(f"| C{c} {COMPONENTS[c]} | {sum(cnt.values())} | {cnt['PASS']} | {cnt['FAIL']} | {cnt['XFAIL']} | {cnt['SKIP']} |")
    out.append(f"| **All** | **{len(rows)}** | **{totals['PASS']}** | **{totals['FAIL']}** | **{totals['XFAIL']}** | **{totals['SKIP']}** |")
    cov = coverage_lines()
    if cov:
        out += ["", "## Coverage", "", "| Scope | Line coverage | Target |", "|---|---:|---:|", *cov,
                "", "HTML reports: `docs/testing/coverage/nlp/html/index.html`, `docs/testing/coverage/web/index.html`."]
    for c in sorted(COMPONENTS):
        out += ["", f"## C{c}. {COMPONENTS[c]}", ""]
        items = by_component.get(c, [])
        if not items:
            out.append("_No results in this run._")
            continue
        out += ["| ID | Case | Input | Expected | Actual | Result |", "|---|---|---|---|---|---|"]
        for r in items:
            out.append(
                f"| {r['id']} | {clip(r['title'], 70)} | {clip(r['input'], 60)} | {clip(r['expected'], 60)} | "
                f"{clip(r['actual'], 60)} | {r['result']}{' (' + r['note'] + ')' if r['result'] == 'XFAIL' else ''} |"
            )
        out += ["", "Sources: " + ", ".join(sorted({f"`{r['source']}`" for r in items}))]
    db_checks = [
        ("db-rls.txt", "R-12.1", "`scripts/db/test-rls.sql` (two tenants, runtime role categoraize_app)"),
        ("db-erasure.txt", "R-12.3", "`scripts/db/test-erasure.sql` (erasure complete and idempotent, cases C12-20..25)"),
        ("db-restore.txt", "R-12.4", "`scripts/backup/restore-test.ps1` (restore dry run, cases C12-30..34)"),
    ]
    not_run = [c for c in db_checks if not (RESULTS / c[0]).exists()]
    if not_run:
        out += ["", "## Not run in this report", "",
                "These database checks need the local Docker Postgres and had no result file in",
                "`docs/testing/results/` when this report was generated, so they are not counted above:", ""]
        out += [f"- {req}: {text}" for _, req, text in not_run]
    (DOCS / "component_tests.md").write_text("\n".join(out) + "\n", encoding="utf-8")

    with (DOCS / "traceability.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["requirement_id", "requirement", "component", "test_id", "test_case", "source", "result", "defect"])
        unmapped = []
        for r in rows:
            reqs = [req for req in REQUIREMENTS if re.match(req[2], r["id"])]
            if not reqs:
                unmapped.append(r["id"])
                continue
            req = reqs[0]
            defect = re.search(r"D-\d{2}", r["note"])
            writer.writerow([req[0], req[1], f"C{component_of(r['id'])}", r["id"], r["title"], r["source"],
                             r["result"], defect.group(0) if defect else ""])
    covered = {req[0] for req in REQUIREMENTS for r in rows if re.match(req[2], r["id"])}
    missing = [req[0] for req in REQUIREMENTS if req[0] not in covered]
    print(f"{len(rows)} cases: {dict(totals)}; requirements without a test: {missing or 'none'}; unmapped cases: {unmapped or 'none'}")
    return 1 if totals["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
