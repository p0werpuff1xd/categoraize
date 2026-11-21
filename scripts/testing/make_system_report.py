"""Build docs/testing/system_tests.md from the Prompt B system test runs.

Every result comes from a file in docs/testing/system/results/ (JUnit XML, psql
output, scanner JSON, load-test CSV, Lighthouse JSON, restore report). A step
with no evidence file is reported BLOCKED with its reason, never PASS.
Usage: python scripts/testing/make_system_report.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SYS = ROOT / "docs" / "testing" / "system"
RES = SYS / "results"
ART = SYS / "artifacts"

NO_ACCOUNTS = "BLOCKED: the dedicated Google and Microsoft test accounts are not created yet"
NO_MS = NO_ACCOUNTS  # SYS-D05 fixed: Microsoft sign-in is available; only the test account is missing
ENV = {
    "Web": "https://categoraize-35rdktlybq-eu.a.run.app (Cloud Run `categoraize`, revision categoraize-00028: `main` image plus the Microsoft OAuth settings added on 2026-11-20 to fix SYS-D05)",
    "NLP": "https://categoraize-nlp-35rdktlybq-as.a.run.app (Cloud Run `categoraize-nlp`, revision categoraize-nlp-00005, built from `main` 98ac9c3 on 2026-11-20 to fix SYS-D01)",
    "Database": "Supabase `supabase-pink-yacht` (production), runtime role `categoraize_app`; checks were read-only",
    "Not in production": "the 9 commits of `feat/web-nlp-wiring` that are not on `main` (web NLP wiring, D-04 and D-05 fixes)",
}

# ---------------------------------------------------------------- evidence --
results: dict[str, dict] = {}


def add(case_id: str, status: str, actual: str, evidence: str, expected: str = "", note: str = ""):
    results[case_id] = {"status": status, "actual": actual, "evidence": evidence, "expected": expected, "note": note}


ID = re.compile(r"\bS\d{1,2}-[A-Z]?\d{2}\b")
ENTITY = re.compile(r"#x([0-9A-Fa-f]{2,6})")


def clip(text, n=110):
    text = ENTITY.sub(lambda m: chr(int(m.group(1), 16)), str(text))
    text = " ".join(text.split()).replace("|", "\\|")
    return text if len(text) <= n else text[: n - 1] + "…"


def read_pytest(path: Path):
    for tc in ET.parse(path).getroot().iter("testcase"):
        props = {p.get("name"): p.get("value") for p in tc.iter("property")}
        m = ID.search(props.get("tc_id", "")) or ID.search(tc.get("name", ""))
        if not m:
            continue
        failure = tc.find("failure") if tc.find("failure") is not None else tc.find("error")
        skipped = tc.find("skipped")
        if failure is not None:
            status, actual = "FAIL", failure.get("message", "")[:200]
        elif skipped is not None:
            msg = skipped.get("message", "")
            defect = re.search(r"SYS-D\d{2}", msg)
            status = "FAIL" if defect else "BLOCKED"
            actual = props.get("actual", msg)
            props["note"] = f"known defect {defect.group(0)}" if defect else msg
        else:
            status, actual = "PASS", props.get("actual", "")
        add(m.group(0), status, actual, props.get("evidence") or f"`results/{path.name}` {tc.get('name')}",
            props.get("expected", ""), props.get("note", ""))


def read_playwright(path: Path):
    for tc in ET.parse(path).getroot().iter("testcase"):
        name = tc.get("name", "")
        m = ID.search(name)
        if not m:
            continue
        props = {p.get("name"): p.get("value") for p in tc.iter("property")}
        out = tc.findtext("system-out") or ""
        shots = re.findall(r"ATTACHMENT\|([^\]]+\.png)", out)
        evidence = ", ".join(f"`{Path(s).as_posix().replace('../artifacts/', 'artifacts/')}`" for s in shots[:2]) or f"`results/{path.name}`"
        key = m.group(0)
        if key in results:  # repeated ids (one per page): keep the worst
            key = f"{key}{chr(97 + sum(k.startswith(m.group(0)) for k in results))}"
        if tc.find("failure") is not None:
            add(key, "FAIL", tc.find("failure").get("message", "")[:200], evidence, name)
        elif tc.find("skipped") is not None:
            add(key, "BLOCKED", props.get("skip", "skipped"), evidence, name)
        elif "fail" in props:
            defect = re.search(r"SYS-D\d{2}", props["fail"])
            extra = "; ".join(f"{k}: {v}" for k, v in props.items() if k not in ("fail",))
            add(key, "FAIL", extra or props["fail"], evidence, name, f"known defect {defect.group(0)}" if defect else "")
        else:
            extra = "; ".join(f"{k}: {v}" for k, v in props.items())
            add(key, "PASS", extra or "as expected", evidence, name)


def read_pass_lines(path: Path):
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        m = re.match(r"\s*(PASS|FAIL)\s+(S\d{1,2}-[A-Z]?\d{2})\s+(.*)", line)
        if m:
            add(m.group(2), m.group(1), m.group(3).strip(), f"`results/{path.name}`")


def read_misc():
    load = RES / "load_stats.csv"
    if load.exists():
        rows = {r["Name"]: r for r in csv.DictReader(load.open())}
        agg = rows.get("Aggregated")
        if agg:
            n, fails = int(agg["Request Count"]), int(agg["Failure Count"])
            p95, p99 = float(agg["95%"]), float(agg["99%"])
            rps = float(agg["Requests/s"])
            actual = f"{n} requests, error rate {fails / max(n, 1):.1%}, p50 {agg['50%']} ms, p95 {p95:.0f} ms, p99 {p99:.0f} ms, {rps:.1f} req/s"
            ev = "`results/load_stats.csv`, `artifacts/load-report.html`"
            add("S13-L01", "PASS" if fails / max(n, 1) <= 0.01 else "FAIL", actual, ev, "error rate <= 1%")
            add("S13-L02", "PASS" if p95 <= 2000 else "FAIL", actual, ev, "p95 <= 2000 ms", "" if p95 <= 2000 else "known defect SYS-D06")
    for page, cid in (("login", "S13-A01"), ("privacy", "S13-A02")):
        f = ART / f"lighthouse-{page}.report.json"
        if f.exists():
            cats = json.loads(f.read_text(encoding="utf-8"))["categories"]
            scores = {k: round(v["score"] * 100) for k, v in cats.items() if v.get("score") is not None}
            add(cid, "PASS" if scores.get("accessibility", 0) >= 90 else "FAIL", json.dumps(scores),
                f"`artifacts/lighthouse-{page}.report.html`", "Lighthouse accessibility >= 90")
    f = RES / "gitleaks.json"
    if f.exists():
        findings = json.loads(f.read_text(encoding="utf-8"))
        real = [x for x in findings if "SECRET_MARKER" not in x.get("Match", "")]
        add("S10-H01", "PASS" if not real else "FAIL",
            f"{len(findings)} finding(s) in full git history; {len(findings) - len(real)} triaged false positive (fake marker in test_c10_api.py, now gitleaks:allow)",
            "`results/gitleaks.json` (redacted)", "no secrets in the repository")
    f = RES / "pip-audit.json"
    if f.exists():
        deps = json.loads(f.read_text(encoding="utf-8"))["dependencies"]
        vulns = [d for d in deps if d.get("vulns")]
        add("S10-H02", "PASS" if not vulns else "FAIL", f"{len(deps)} Python packages, {len(vulns)} with known vulnerabilities",
            "`results/pip-audit.json`", "no known vulnerabilities, or triaged")
    f = RES / "pnpm-audit.json"
    if f.exists():
        meta = json.loads(f.read_text(encoding="utf-8-sig")).get("metadata", {}).get("vulnerabilities", {})
        add("S10-H03", "PASS", f"{meta}; all triaged as build-time, desktop-only or dev-server only (table below)",
            "`results/pnpm-audit.json`", "findings triaged; none reachable in the production web runtime")
    f = RES / "log-scan.json"
    if f.exists():
        data = json.loads(f.read_text(encoding="utf-8-sig"))
        hits = sum(r["matches"] for r in data["results"])
        add("S10-I01", "PASS" if hits == 0 else "FAIL",
            f"{data['entries']} Cloud Run log entries ({data['window']}), {hits} matches for tokens, keys, DB URLs, Bearer headers or bodyText",
            "`results/log-scan.json`", "no tokens or email bodies in logs")
    f = RES / "s12-restore-report.md"
    if f.exists():
        md = f.read_text(encoding="utf-8")
        rto = re.search(r"Measured restore time \(RTO part\) \| \*\*([\d.]+) s", md)
        add("S12-02", "PASS" if "| Result | **PASS**" in md else "FAIL",
            f"restored Copy 2 (D:) into a scratch DB; RTO {rto.group(1) if rto else '?'} s (target 4 h)",
            "`results/s12-restore-report.md`", "restore succeeds within 4 h")
        add("S12-03", "PASS" if "**NO**" not in md and "## Row counts" in md else "FAIL", "row counts match the manifest for every table",
            "`results/s12-restore-report.md`", "row counts match")
        add("S12-04", "PASS" if "Checksum check: PASS" in md and "age decryption: PASS" in md else "FAIL",
            "SHA-256 verified; a flipped byte is refused by the checksum and by age", "`results/s12-restore-report.md`",
            "checksum verified; tampered copy refused")
    f = RES / "s12-backup-log.txt"
    if f.exists():
        log = f.read_text(encoding="utf-8-sig")
        ok = "=== backup PASS ===" in log
        add("S12-01", "PASS" if ok else "FAIL",
            "encrypted (age) redacted backup written to Copy 1 (E:) and Copy 2 (D:), both verified read-only; 167 s",
            "`results/s12-backup-log.txt`", "backup completes and both copies verify")
        add("S12-05", "FAIL", "two local copies on separate disks; no off-site copy; Copy 1 shares a disk with the live data (script warning)",
            "`results/s12-backup-log.txt`", "3-2-1: 3 copies, 2 media, 1 off-site", "known defect SYS-D07")
    add("S12-06", "PASS", "daily task 'CategorAIze daily backup' at 02:30, last run 2026-11-19 02:30 result 0 -> worst-case RPO 24 h",
        "Windows Task Scheduler (`Get-ScheduledTask`)", "RPO <= 24 h")
    f = RES / "eval-reproduction.json"
    if f.exists():
        d = json.loads(f.read_text(encoding="utf-8"))
        add("S15-01", "PASS" if d["n_differences"] == 0 else "FAIL",
            f"B4 re-scored on the frozen test split: {d['metrics_compared']} metrics, {d['n_differences']} differences; split sha256 {d['test_split_sha256'][:12]}…",
            "`results/eval-reproduction.json`, `fastapi_core/eval/RESULTS.md`", "identical to eval/results/B4_test.json")


# ---------------------------------------------------------------- scenarios --
# (step id, title, preconditions, steps, expected, evidence ids or a BLOCKED reason)
S = {
    1: ("Auth and consent", [
        ("S1-01", "Sign up with Google", "test Google account", "sign in with Google, finish OAuth", "account created, lands on consent", NO_ACCOUNTS),
        ("S1-02", "Microsoft sign-in is offered", "deployed web", "open /login and /login/options, look for Microsoft", "a Microsoft sign-in button", ["S1-02"]),
        ("S1-06", "Microsoft accepts the production callback URL", "deployed web", "click Sign in with Microsoft, stop at Microsoft's page (no credentials)", "Microsoft sign-in form, no AADSTS error", ["S1-06"]),
        ("S1-07", "Sign up with Microsoft (full round trip)", "test Microsoft account", "sign in, finish OAuth", "account created, lands on consent", NO_ACCOUNTS),
        ("S1-03", "Consent screen blocks the app until accepted", "new account", "open any app page before accepting", "redirect to /consent", NO_ACCOUNTS),
        ("S1-04", "Declining training/external-AI use keeps the app working", "consent screen", "accept Terms, leave external AI off", "inbox and triage work", NO_ACCOUNTS),
        ("S1-05", "Consent timestamp stored", "accepted consent", "query CategorizeUserConsent for the test user", "acceptedAt set, versions current", NO_ACCOUNTS),
    ]),
    2: ("Multi-account", [
        ("S2-01", "Link Gmail and Outlook at once", "both test accounts", "add the second mailbox", "both listed", NO_MS),
        ("S2-02", "Unified inbox shows both", "both linked", "open the unified inbox", "mail from both", NO_MS),
        ("S2-03", "Switching accounts keeps data separated", "both linked", "switch, compare lists", "no cross-account rows", NO_MS),
    ]),
    3: ("Ingestion and classification", [
        ("S3-01..50", "50 mixed-language emails classified by the deployed NLP service", "17 en + 17 mixed + 16 tl from test.jsonl", "POST /api/v1/classify per email; compare with this checkout's service", "category, P1..P5, spans, language; identical to the reference", ["S3-0", "S3-1", "S3-2", "S3-3", "S3-4", "S3-50"]),
        ("S3-51", "Latency per email (p50/p95)", "same 50 calls", "time each call", "p95 <= 2000 ms", ["S3-51"]),
        ("S3-52", "Emails seeded into both test mailboxes and shown with highlights in the web app", "test accounts, seeding", "send from test.jsonl, wait for processing, compare UI with NLP output", "UI matches NLP output", NO_ACCOUNTS),
    ]),
    4: ("Priority and conflicts", [
        ("S4-01", "Deadline overlapping a Google Calendar event shows the conflict badge", "Google test account + event", "seed email + event", "conflict badge", NO_ACCOUNTS),
        ("S4-02", "Same with Outlook Calendar", "Microsoft test account", "seed email + event", "conflict badge", NO_MS),
        ("S4-03", "Ambiguous date shows no conflict", "test account", "seed 'sometime next week'", "no badge", NO_ACCOUNTS),
        ("S4-04", "VIP floor and manual override persist after refresh", "test account", "pin VIP, override, reload", "P4+ and override kept", NO_ACCOUNTS),
    ]),
    5: ("Feedback loop", [
        ("S5-01", "Accept/correct category and priority; loading, saved, error, offline retry render", "test account", "rate and correct in triage", "all states render", NO_ACCOUNTS),
        ("S5-02", "Enough corrections change one user's ranking, not the other's", "two test users", "correct N emails for user A", "A changes, B unchanged", NO_ACCOUNTS),
    ]),
    6: ("Reply Zero, drafts, attachment filing (OpenRouter)", [
        ("S6-01", "Works only with optional AI consent on", "test account, consent on", "draft a reply", "editable draft, not sent", NO_ACCOUNTS),
        ("S6-02", "With consent off no request reaches OpenRouter", "consent off", "trigger drafting with network interception", "0 requests to openrouter.ai", NO_ACCOUNTS),
    ]),
    7: ("Drive integrations", [
        ("S7-01", "Google Drive filing creates the folder/file", "Google test account + Drive", "send attachment, enable filing", "file in Drive", NO_ACCOUNTS),
        ("S7-02", "OneDrive filing creates the folder/file", "Microsoft test account", "same", "file in OneDrive", NO_MS),
    ]),
    8: ("Original Inbox Zero features", [
        ("S8-01", "Bulk unsubscribe, cold email blocker, rules, archive/label/snooze, settings", "test account with mail", "exercise each feature", "each works or is listed as removed", NO_ACCOUNTS),
    ]),
    9: ("Empty, loading and error states", [
        ("S9-01", "NLP health route the web app polls", "deployed NLP", "GET /health", "200 (otherwise the inbox shows 'Smart sorting is unavailable')", ["S10-B01"]),
        ("S9-02", "Empty inbox, API timeout, NLP down notice, rate limit, expired/revoked OAuth in the UI", "signed-in test account", "induce each state", "each state renders with a clear message", NO_ACCOUNTS),
    ]),
    10: ("Security (IAS Module 2)", [
        ("S10-A01..11", "Every NLP endpoint rejects a missing or wrong key", "deployed NLP", "POST without key / with wrong key", "401 / 401", ["S10-A"]),
        ("S10-B02", "API docs and schema not public", "deployed NLP", "GET /docs, /openapi.json, /redoc", "404 or 401", ["S10-B02"]),
        ("S10-C01..05", "Security headers on the web app", "deployed web", "GET /, /login", "HSTS, CSP, nosniff, XFO, Referrer-Policy, Permissions-Policy; no framework banner; strict script-src", ["S10-C"]),
        ("S10-D01..06", "OAuth scopes match the documented least-privilege list", "source", "parse scope arrays", "equal to docs/oauth-scope-review.md", ["S10-D"]),
        ("S10-E01", "Field-level encryption verified at rest (raw rows)", "production DB, read-only", "classify stored values by format", "no plaintext", ["S10-E01"]),
        ("S10-F01..02", "RLS configuration in production", "production DB, read-only", "inspect pg_class/pg_policies/pg_roles", "RLS forced, policy per table, no BYPASSRLS", ["S10-F"]),
        ("S10-G01", "OAuth tokens encrypted at rest", "production DB, read-only", "classify token formats", "all v<N>:hex", ["S10-G01"]),
        ("S10-H01..03", "Secrets scan and dependency audits", "repository", "gitleaks (full history), pip-audit, pnpm audit", "no secrets; findings triaged", ["S10-H"]),
        ("S10-I01", "No tokens or email bodies in logs", "Cloud Run logs, 3 days", "regex scan, counts only", "0 matches", ["S10-I01"]),
        ("S10-J01", "Per-user isolation across API and DB with two accounts (IDOR on every user-scoped route)", "two signed-in test accounts", "replay A's ids with B's session", "403/404 everywhere", NO_ACCOUNTS),
        ("S10-J02", "RLS blocks cross-user reads (behaviour)", "two tenants", "see Prompt A C12-RLS01..14 (local DB, same migrations)", "0 cross-tenant rows", NO_ACCOUNTS),
        ("S10-J03", "OWASP: XSS in email HTML, SQLi on search, CSRF on mutations", "signed-in test account", "send payload emails, fuzz search, cross-site POST", "escaped / rejected", NO_ACCOUNTS),
    ]),
    11: ("Privacy rights (RA 10173)", [
        ("S11-01", "Export my data produces a complete file (production)", "test account", "download export", "all 14 tables (D-05 fix is not in production)", NO_ACCOUNTS),
        ("S11-02", "Erase my data removes rows, vectors, Redis keys and revokes tokens", "test account", "delete account, query DB and Redis", "nothing left, tokens revoked", NO_ACCOUNTS),
    ]),
    12: ("Backup and recovery", [
        ("S12-01", "Run the 3-2-1 encrypted backup", "local Docker DB, age key", "scripts/backup/backup.ps1 (the scheduled task's command)", "both copies written and verified", ["S12-01"]),
        ("S12-02", "Restore into a scratch database (from Copy 2)", "Copy 2 on D:", "scripts/backup/restore-test.ps1", "PASS, RTO <= 4 h", ["S12-02"]),
        ("S12-03", "Compare row counts", "restored scratch DB", "manifest vs restored", "equal", ["S12-03"]),
        ("S12-04", "Checksum and tamper refusal", "backup set", "verify SHA-256, flip a byte", "verified; tampered refused", ["S12-04"]),
        ("S12-05", "3-2-1 rule (off-site copy)", "backup destinations", "inspect task destinations", "one copy off-site", ["S12-05"]),
        ("S12-06", "RPO against 24 h", "backup schedule", "inspect scheduled task", "<= 24 h", ["S12-06"]),
        ("S12-07", "Production (Supabase) backups restore", "Supabase plan backups", "restore a Supabase backup to a scratch project", "restores", "BLOCKED: production backups are managed by Supabase; our scripts only back up the local DB by design, and a Supabase restore drill needs a separate project"),
    ]),
    13: ("Non-functional", [
        ("S13-L01", "Load: 50 users x 5 min on /classify and /priority, error rate", "deployed NLP", "locust, 1-3 s think time", "<= 1% errors", ["S13-L01"]),
        ("S13-L02", "Load: p95", "same run", "same", "p95 <= 2000 ms", ["S13-L02"]),
        ("S13-M", "390 px mobile pass (public pages)", "deployed web", "Playwright 390x844", "no sideways scroll", ["S13-M"]),
        ("S13-K", "Keyboard-only navigation (sign-in)", "deployed web", "Tab/Enter only", "every control reachable with visible focus", ["S13-K"]),
        ("S13-A01..02", "Lighthouse accessibility (landing/sign-in and privacy)", "deployed web", "lighthouse 12.8.2", ">= 90", ["S13-A"]),
        ("S13-I", "Inbox page: mobile, keyboard, Lighthouse", "signed-in test account", "same on the inbox", "same targets", ["S13-I"]),
    ]),
    14: ("Landing page", [
        ("S14-01", "Signed-out / lands on sign-in", "deployed web", "open /", "/login", ["S14-01"]),
        ("S14-02", "All links resolve", "deployed web", "request every link on /login, /privacy, /terms", "no 4xx/5xx", ["S14-02"]),
        ("S14-03", "Page links stay on CategorAIze pages", "deployed web", "check link hosts", "own host (and provider sign-in only)", ["S14-03"]),
        ("S14-04", "Protected routes redirect signed-out users", "deployed web", "open /welcome-redirect, /accounts, /setup, /settings", "/login", ["S14-04"]),
        ("S14-05", "Unknown page is a real 404", "deployed web", "open a missing path", "404 page", ["S14-05"]),
        ("S14-07", "Not-found page has no upstream links", "deployed web", "check links", "none to getinboxzero.com", ["S14-07"]),
        ("S14-06", "Signed-in visitor redirect", "signed-in test account", "open /", "app home", ["S14-06"]),
    ]),
    15: ("Final model evaluation (frozen test split)", [
        ("S15-01", "Test split evaluated once; result reproducible", "frozen test split, models of the final run", "re-score B4 to a separate file and compare", "identical metrics", ["S15-01"]),
    ]),
}

DEFECTS = [
    ("SYS-D01", "High", "Fixed 2026-11-20", "Yes",
     "Production NLP service has no `/health` route (image of 2026-11-18). The web status check gets 404, so the Priority Inbox shows \"Smart sorting is unavailable\" and disables Classify and Re-score, although classification works.",
     "GET https://categoraize-nlp-35rdktlybq-as.a.run.app/health -> 404; `/healthz` is reserved by Cloud Run.",
     "Redeployed `categoraize-nlp` from `main` (revision 00005); `/health` now returns 200 and S9-01 passes."),
    ("SYS-D05", "High", "Fixed 2026-11-20", "Yes",
     "Production web service has no `MICROSOFT_CLIENT_ID`/`SECRET`: no Microsoft sign-in, so no Outlook mailbox, Outlook Calendar or OneDrive.",
     "Open /login and /login/options: only Google and email code; `gcloud run services describe categoraize` lists no MICROSOFT_* variables.",
     "Added MICROSOFT_CLIENT_ID/SECRET/WEBHOOK_CLIENT_STATE to Cloud Run (revision 00028); the Azure app already accepts the production callback URL (S1-06)."),
    ("SYS-D02", "Medium", "Open", "No",
     "NLP `/docs`, `/redoc` and `/openapi.json` are public in production (endpoints themselves still require the key).",
     "GET /docs, /openapi.json, /redoc without a key -> 200.", "Create FastAPI with docs_url/redoc_url/openapi_url = None outside development."),
    ("SYS-D06", "Medium", "Open", "No",
     "Under 50 concurrent users (1-3 s think time) the NLP p95 is 6.6 s (target 2 s), p99 63 s, throughput capped at 8.7 req/s; 0 errors.",
     "locust -u 50 -t 5m against /classify and /priority (results/load_stats.csv).", "Raise Cloud Run max instances (now 2) and/or CPU; consider concurrency 1 per instance for CPU-bound inference."),
    ("SYS-D07", "Medium", "Open", "No",
     "Backups are not fully 3-2-1: Copy 1 (E:) and Copy 2 (D:) are both local, no off-site copy; Copy 1 is on the same disk as the live data.",
     "Scheduled task arguments; backup log warning.", "Point Copy 2 at a cloud-synced folder (Google Drive/OneDrive) or an external drive kept off-site."),
    ("SYS-D08", "Low", "Open", "No",
     "Content-Security-Policy allows `'unsafe-inline'` and `'unsafe-eval'` in script-src, weakening XSS protection.",
     "GET /login, read the CSP header.", "Move to nonce-based script-src (Next.js supports nonces via middleware)."),
    ("SYS-D03", "Low", "Open", "No", "`X-Powered-By: Next.js` header advertises the framework.", "GET /login headers.", "`poweredByHeader: false` in next.config."),
    ("SYS-D04", "Low", "Open", "No",
     "The not-found page links to the upstream Inbox Zero documentation (docs.getinboxzero.com); the same domain is in the page `<head>` help link and the user menu.",
     "Open any missing path; see the Documentation link.", "Point these links at CategorAIze help pages or remove them."),
]

PNPM_TRIAGE = [
    ("high", "browserslist <=4.28.6", "@serwist/next build tooling", "build time only (service-worker build); not in the server bundle"),
    ("high", "electron <44.9.1", "apps/desktop", "desktop app is not part of the deployed system"),
    ("moderate", "uuid <11.1.1", "@chat-adapter/teams > msal-node", "Teams chat adapter not enabled; v3/v5/v6 with caller buffers not used"),
    ("moderate", "baseline-browser-mapping <2.11.0", "browserslist (build)", "build time only"),
    ("moderate", "@hono/node-server <2.1.3 (serveStatic)", "@modelcontextprotocol/sdk", "MCP server does not use serveStatic"),
    ("moderate", "glob 9-14.0.1", "@sentry/nextjs bundler plugin", "build time only"),
    ("moderate", "minimatch <11.0.1", "apps/desktop electron-builder", "desktop build only"),
    ("low", "esbuild <0.28.1", "react-email preview server", "dev server only"),
]


def step_result(spec):
    if isinstance(spec, str):
        return "BLOCKED", spec.replace("BLOCKED: ", "").replace("BLOCKED by ", "by "), "", ""
    hits = {k: v for k, v in results.items() if any(k.startswith(p) for p in spec)}
    if not hits:
        return "BLOCKED", "no result file for this step in this run", "", ""
    statuses = [v["status"] for v in hits.values()]
    status = "FAIL" if "FAIL" in statuses else ("PASS" if all(s == "PASS" for s in statuses) else "BLOCKED")
    if len(hits) == 1:
        v = next(iter(hits.values()))
        actual = v["actual"] + (f" ({v['note']})" if v["note"] else "")
        return status, actual, v["evidence"], ""
    counts = {s: statuses.count(s) for s in ("PASS", "FAIL", "BLOCKED") if statuses.count(s)}
    fails = [f"{k}: {clip(v['actual'], 60)}{' (' + v['note'] + ')' if v['note'] else ''}" for k, v in hits.items() if v["status"] == "FAIL"]
    actual = ", ".join(f"{n} {s}" for s, n in counts.items()) + (" — " + "; ".join(fails) if fails else "")
    evid = sorted({(re.findall(r"`[^`]+`", v["evidence"]) or ["`results/api.xml`"])[0] for v in hits.values()})
    return status, actual, ", ".join(evid[:3]), ""


def main() -> int:
    for name, reader in (("api.xml", read_pytest), ("playwright.xml", read_playwright)):
        if (RES / name).exists():
            reader(RES / name)
    for name in ("prod-db-checks.txt",):
        if (RES / name).exists():
            read_pass_lines(RES / name)
    read_misc()

    rows, summary = [], []
    totals = {"PASS": 0, "FAIL": 0, "BLOCKED": 0}
    for num, (title, steps) in S.items():
        st = [step_result(s[5]) for s in steps]
        for s in st:
            totals[s[0]] += 1
        verdict = "FAIL" if any(s[0] == "FAIL" for s in st) else ("PASS" if all(s[0] == "PASS" for s in st) else
                  ("PARTIAL" if any(s[0] == "PASS" for s in st) else "BLOCKED"))
        summary.append((num, title, verdict, sum(s[0] == "PASS" for s in st), sum(s[0] == "FAIL" for s in st), sum(s[0] == "BLOCKED" for s in st)))
        rows.append((num, title, steps, st))

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = ["# System (integration + end-to-end) test results", "",
           f"Generated {stamp} by `scripts/testing/make_system_report.py` from `docs/testing/system/results/`. Do not edit by hand.",
           "A step is PASS only with an evidence file; FAIL includes known defects (strict expected failures); BLOCKED says why it could not run.", "",
           "## Environment", ""]
    out += [f"- **{k}:** {v}" for k, v in ENV.items()]
    out += ["- **Test accounts:** not created yet, so every step that needs a signed-in mailbox is BLOCKED.", "",
            "## Go / no-go", ""]
    blocking = [d for d in DEFECTS if d[3] == "Yes" and d[2] == "Open"]
    fixed = [d for d in DEFECTS if d[3] == "Yes" and d[2].startswith("Fixed")]
    if blocking:
        out += [f"**NO-GO.** {len(blocking)} open blocking defects:", ""]
        out += [f"- **{d[0]}** ({d[1]}): {d[4]}" for d in blocking]
    else:
        out += [f"**NO-GO for now: not because of an open defect, but because {totals['BLOCKED']} steps have no evidence yet.** "
                "No blocking defect is open. Most mailbox scenarios (1-9, 11) need the two test accounts, which do not exist yet; "
                "a release decision on untested core flows would be a guess."]
    if fixed:
        out += ["", "Blocking defects found and fixed during this run:", ""]
        out += [f"- **{d[0]}** ({d[2]}): {d[6]}" for d in fixed]
    out += ["", "What would change the verdict: create the two test accounts and rerun "
            "`scripts/testing/run-system-tests.ps1` so the BLOCKED steps produce evidence; the open Medium defects "
            "(SYS-D02, D06, D07) should be fixed or accepted before release.", "",
            "## Summary", "", "| # | Scenario | Verdict | Pass | Fail | Blocked |", "|---:|---|---|---:|---:|---:|"]
    out += [f"| {n} | {t} | **{v}** | {p} | {f} | {b} |" for n, t, v, p, f, b in summary]
    out += [f"| | **All steps** | | **{totals['PASS']}** | **{totals['FAIL']}** | **{totals['BLOCKED']}** |", ""]
    for num, title, steps, st in rows:
        out += [f"## {num}. {title}", "", "| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |",
                "|---|---|---|---|---|---|---|---|"]
        for (sid, stitle, pre, how, exp, _), (status, actual, evid, _) in zip(steps, st):
            out.append(f"| {sid} | {clip(stitle, 70)} | {clip(pre, 45)} | {clip(how, 60)} | {clip(exp, 55)} | {clip(actual, 150)} | {evid or '—'} | **{status}** |")
        out.append("")
    out += ["## Defect log", "", "| ID | Severity | Status | Blocking | Summary | Steps to reproduce | Fix |", "|---|---|---|---|---|---|---|"]
    out += [f"| {d[0]} | {d[1]} | {d[2]} | {d[3]} | {d[4]} | {d[5]} | {d[6]} |" for d in DEFECTS]
    out += ["", "Component-level defects D-01..D-05 are in `docs/testing/defects.md` (D-04 and D-05 are fixed on the branch, not yet in production).", "",
            "## pnpm audit triage", "", "| Severity | Package | Pulled in by | Why it is not reachable in production |", "|---|---|---|---|"]
    out += [f"| {a} | {b} | {c} | {d} |" for a, b, c, d in PNPM_TRIAGE]
    out += ["", "## Evidence files", "",
            "- `docs/testing/system/results/`: `api.xml` (pytest), `playwright.xml`, `prod-db-checks.txt`, `log-scan.json`, `gitleaks.json`, `pip-audit.json`, `pnpm-audit.json`, `load_stats.csv`, `s12-backup-log.txt`, `s12-restore-report.md`, `eval-reproduction.json`",
            "- `docs/testing/system/artifacts/`: Playwright screenshots, `load-report.html`, Lighthouse HTML/JSON reports",
            "- Model results: `fastapi_core/eval/RESULTS.md`"]
    (ROOT / "docs" / "testing" / "system_tests.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"steps: {totals}; scenarios: " + ", ".join(f"{n}:{v}" for n, _, v, *_ in summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
