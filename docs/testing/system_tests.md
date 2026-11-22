# System (integration + end-to-end) test results

Generated 2026-11-19 18:07 UTC by `scripts/testing/make_system_report.py` from `docs/testing/system/results/`. Do not edit by hand.
A step is PASS only with an evidence file; FAIL includes known defects (strict expected failures); BLOCKED says why it could not run.

## Environment

- **Web:** https://categoraize-35rdktlybq-eu.a.run.app (Cloud Run `categoraize`, revision categoraize-00028: `main` image plus the Microsoft OAuth settings added on 2026-11-20 to fix SYS-D05)
- **NLP:** https://categoraize-nlp-35rdktlybq-as.a.run.app (Cloud Run `categoraize-nlp`, revision categoraize-nlp-00005, built from `main` 98ac9c3 on 2026-11-20 to fix SYS-D01)
- **Database:** Supabase `supabase-pink-yacht` (production), runtime role `categoraize_app`; checks were read-only
- **Not in production:** the 9 commits of `feat/web-nlp-wiring` that are not on `main` (web NLP wiring, D-04 and D-05 fixes)
- **Test accounts:** not created yet, so every step that needs a signed-in mailbox is BLOCKED.

## Go / no-go

**NO-GO for now: not because of an open defect, but because 29 steps have no evidence yet.** No blocking defect is open. Most mailbox scenarios (1-9, 11) need the two test accounts, which do not exist yet; a release decision on untested core flows would be a guess.

Blocking defects found and fixed during this run:

- **SYS-D01** (Fixed 2026-11-20): Redeployed `categoraize-nlp` from `main` (revision 00005); `/health` now returns 200 and S9-01 passes.
- **SYS-D05** (Fixed 2026-11-20): Added MICROSOFT_CLIENT_ID/SECRET/WEBHOOK_CLIENT_STATE to Cloud Run (revision 00028); the Azure app already accepts the production callback URL (S1-06).

What would change the verdict: create the two test accounts and rerun `scripts/testing/run-system-tests.ps1` so the BLOCKED steps produce evidence; the open Medium defects (SYS-D02, D06, D07) should be fixed or accepted before release.

## Summary

| # | Scenario | Verdict | Pass | Fail | Blocked |
|---:|---|---|---:|---:|---:|
| 1 | Auth and consent | **PARTIAL** | 2 | 0 | 5 |
| 2 | Multi-account | **BLOCKED** | 0 | 0 | 3 |
| 3 | Ingestion and classification | **PARTIAL** | 2 | 0 | 1 |
| 4 | Priority and conflicts | **BLOCKED** | 0 | 0 | 4 |
| 5 | Feedback loop | **BLOCKED** | 0 | 0 | 2 |
| 6 | Reply Zero, drafts, attachment filing (OpenRouter) | **BLOCKED** | 0 | 0 | 2 |
| 7 | Drive integrations | **BLOCKED** | 0 | 0 | 2 |
| 8 | Original Inbox Zero features | **BLOCKED** | 0 | 0 | 1 |
| 9 | Empty, loading and error states | **PARTIAL** | 1 | 0 | 1 |
| 10 | Security (IAS Module 2) | **FAIL** | 7 | 2 | 3 |
| 11 | Privacy rights (RA 10173) | **BLOCKED** | 0 | 0 | 2 |
| 12 | Backup and recovery | **FAIL** | 5 | 1 | 1 |
| 13 | Non-functional | **FAIL** | 4 | 1 | 1 |
| 14 | Landing page | **FAIL** | 5 | 1 | 1 |
| 15 | Final model evaluation (frozen test split) | **PASS** | 1 | 0 | 0 |
| | **All steps** | | **27** | **5** | **29** |

## 1. Auth and consent

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S1-01 | Sign up with Google | test Google account | sign in with Google, finish OAuth | account created, lands on consent | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S1-02 | Microsoft sign-in is offered | deployed web | open /login and /login/options, look for Microsoft | a Microsoft sign-in button | microsoft-buttons: 1 on /login, 0 on /login/options | `artifacts/playwright/s13-mobile-keyboard-S1-02--d06a4-red-sign-up-with-Microsoft--desktop/test-finished-1.png` | **PASS** |
| S1-06 | Microsoft accepts the production callback URL | deployed web | click Sign in with Microsoft, stop at Microsoft's page (no … | Microsoft sign-in form, no AADSTS error | redirect-uri: login.microsoftonline.com redirect_uri=https://categoraize-513655883842.asia-southeast3.run.app/api/auth/callback/microsoft | `artifacts/playwright/s13-mobile-keyboard-S1-06--829d6-allback-URL-no-AADSTS50011--desktop/test-finished-1.png` | **PASS** |
| S1-07 | Sign up with Microsoft (full round trip) | test Microsoft account | sign in, finish OAuth | account created, lands on consent | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S1-03 | Consent screen blocks the app until accepted | new account | open any app page before accepting | redirect to /consent | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S1-04 | Declining training/external-AI use keeps the app working | consent screen | accept Terms, leave external AI off | inbox and triage work | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S1-05 | Consent timestamp stored | accepted consent | query CategorizeUserConsent for the test user | acceptedAt set, versions current | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 2. Multi-account

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S2-01 | Link Gmail and Outlook at once | both test accounts | add the second mailbox | both listed | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S2-02 | Unified inbox shows both | both linked | open the unified inbox | mail from both | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S2-03 | Switching accounts keeps data separated | both linked | switch, compare lists | no cross-account rows | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 3. Ingestion and classification

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S3-01..50 | 50 mixed-language emails classified by the deployed NLP service | 17 en + 17 mixed + 16 tl from test.jsonl | POST /api/v1/classify per email; compare with this checkout… | category, P1..P5, spans, language; identical to the re… | 50 PASS | `results/api.xml` | **PASS** |
| S3-51 | Latency per email (p50/p95) | same 50 calls | time each call | p95 <= 2000 ms | {"p50_ms": 491, "p95_ms": 1002, "max_ms": 1450} | `results/api.xml` test_latency_p50_p95 | **PASS** |
| S3-52 | Emails seeded into both test mailboxes and shown with highlights in t… | test accounts, seeding | send from test.jsonl, wait for processing, compare UI with … | UI matches NLP output | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 4. Priority and conflicts

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S4-01 | Deadline overlapping a Google Calendar event shows the conflict badge | Google test account + event | seed email + event | conflict badge | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S4-02 | Same with Outlook Calendar | Microsoft test account | seed email + event | conflict badge | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S4-03 | Ambiguous date shows no conflict | test account | seed 'sometime next week' | no badge | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S4-04 | VIP floor and manual override persist after refresh | test account | pin VIP, override, reload | P4+ and override kept | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 5. Feedback loop

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S5-01 | Accept/correct category and priority; loading, saved, error, offline … | test account | rate and correct in triage | all states render | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S5-02 | Enough corrections change one user's ranking, not the other's | two test users | correct N emails for user A | A changes, B unchanged | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 6. Reply Zero, drafts, attachment filing (OpenRouter)

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S6-01 | Works only with optional AI consent on | test account, consent on | draft a reply | editable draft, not sent | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S6-02 | With consent off no request reaches OpenRouter | consent off | trigger drafting with network interception | 0 requests to openrouter.ai | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 7. Drive integrations

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S7-01 | Google Drive filing creates the folder/file | Google test account + Drive | send attachment, enable filing | file in Drive | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S7-02 | OneDrive filing creates the folder/file | Microsoft test account | same | file in OneDrive | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 8. Original Inbox Zero features

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S8-01 | Bulk unsubscribe, cold email blocker, rules, archive/label/snooze, se… | test account with mail | exercise each feature | each works or is listed as removed | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 9. Empty, loading and error states

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S9-01 | NLP health route the web app polls | deployed NLP | GET /health | 200 (otherwise the inbox shows 'Smart sorting is unava… | 200 | `results/api.xml` test_health_route_the_web_app_calls | **PASS** |
| S9-02 | Empty inbox, API timeout, NLP down notice, rate limit, expired/revoke… | signed-in test account | induce each state | each state renders with a clear message | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 10. Security (IAS Module 2)

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S10-A01..11 | Every NLP endpoint rejects a missing or wrong key | deployed NLP | POST without key / with wrong key | 401 / 401 | 11 PASS | `results/api.xml` | **PASS** |
| S10-B02 | API docs and schema not public | deployed NLP | GET /docs, /openapi.json, /redoc | 404 or 401 | {"/docs": 200, "/openapi.json": 200, "/redoc": 200} (known defect SYS-D02) | `results/api.xml` test_api_docs_are_not_public | **FAIL** |
| S10-C01..05 | Security headers on the web app | deployed web | GET /, /login | HSTS, CSP, nosniff, XFO, Referrer-Policy, Permissions-… | 3 PASS, 2 FAIL — S10-C05: script-src 'self' 'unsafe-inline' 'unsafe-eval' https: (known defect SYS-D08); S10-C03: Next.js (known defect SYS-D03) | `results/api.xml` | **FAIL** |
| S10-D01..06 | OAuth scopes match the documented least-privilege list | source | parse scope arrays | equal to docs/oauth-scope-review.md | 6 PASS | `results/api.xml` | **PASS** |
| S10-E01 | Field-level encryption verified at rest (raw rows) | production DB, read-only | classify stored values by format | no plaintext | no plaintext in encrypted columns (826 encrypted values) | `results/prod-db-checks.txt` | **PASS** |
| S10-F01..02 | RLS configuration in production | production DB, read-only | inspect pg_class/pg_policies/pg_roles | RLS forced, policy per table, no BYPASSRLS | 2 PASS | `results/prod-db-checks.txt` | **PASS** |
| S10-G01 | OAuth tokens encrypted at rest | production DB, read-only | classify token formats | all v<N>:hex | every stored OAuth access and refresh token is encrypted (1 accounts) | `results/prod-db-checks.txt` | **PASS** |
| S10-H01..03 | Secrets scan and dependency audits | repository | gitleaks (full history), pip-audit, pnpm audit | no secrets; findings triaged | 3 PASS | `results/gitleaks.json`, `results/pip-audit.json`, `results/pnpm-audit.json` | **PASS** |
| S10-I01 | No tokens or email bodies in logs | Cloud Run logs, 3 days | regex scan, counts only | 0 matches | 20000 Cloud Run log entries (3d), 0 matches for tokens, keys, DB URLs, Bearer headers or bodyText | `results/log-scan.json` | **PASS** |
| S10-J01 | Per-user isolation across API and DB with two accounts (IDOR on every… | two signed-in test accounts | replay A's ids with B's session | 403/404 everywhere | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S10-J02 | RLS blocks cross-user reads (behaviour) | two tenants | see Prompt A C12-RLS01..14 (local DB, same migrations) | 0 cross-tenant rows | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S10-J03 | OWASP: XSS in email HTML, SQLi on search, CSRF on mutations | signed-in test account | send payload emails, fuzz search, cross-site POST | escaped / rejected | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 11. Privacy rights (RA 10173)

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S11-01 | Export my data produces a complete file (production) | test account | download export | all 14 tables (D-05 fix is not in production) | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |
| S11-02 | Erase my data removes rows, vectors, Redis keys and revokes tokens | test account | delete account, query DB and Redis | nothing left, tokens revoked | the dedicated Google and Microsoft test accounts are not created yet | — | **BLOCKED** |

## 12. Backup and recovery

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S12-01 | Run the 3-2-1 encrypted backup | local Docker DB, age key | scripts/backup/backup.ps1 (the scheduled task's command) | both copies written and verified | encrypted (age) redacted backup written to Copy 1 (E:) and Copy 2 (D:), both verified read-only; 167 s | `results/s12-backup-log.txt` | **PASS** |
| S12-02 | Restore into a scratch database (from Copy 2) | Copy 2 on D: | scripts/backup/restore-test.ps1 | PASS, RTO <= 4 h | restored Copy 2 (D:) into a scratch DB; RTO 148.95 s (target 4 h) | `results/s12-restore-report.md` | **PASS** |
| S12-03 | Compare row counts | restored scratch DB | manifest vs restored | equal | row counts match the manifest for every table | `results/s12-restore-report.md` | **PASS** |
| S12-04 | Checksum and tamper refusal | backup set | verify SHA-256, flip a byte | verified; tampered refused | SHA-256 verified; a flipped byte is refused by the checksum and by age | `results/s12-restore-report.md` | **PASS** |
| S12-05 | 3-2-1 rule (off-site copy) | backup destinations | inspect task destinations | one copy off-site | two local copies on separate disks; no off-site copy; Copy 1 shares a disk with the live data (script warning) (known defect SYS-D07) | `results/s12-backup-log.txt` | **FAIL** |
| S12-06 | RPO against 24 h | backup schedule | inspect scheduled task | <= 24 h | daily task 'CategorAIze daily backup' at 02:30, last run 2026-11-19 02:30 result 0 -> worst-case RPO 24 h | Windows Task Scheduler (`Get-ScheduledTask`) | **PASS** |
| S12-07 | Production (Supabase) backups restore | Supabase plan backups | restore a Supabase backup to a scratch project | restores | production backups are managed by Supabase; our scripts only back up the local DB by design, and a Supabase restore drill needs a separate project | — | **BLOCKED** |

## 13. Non-functional

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S13-L01 | Load: 50 users x 5 min on /classify and /priority, error rate | deployed NLP | locust, 1-3 s think time | <= 1% errors | 2602 requests, error rate 0.0%, p50 2100 ms, p95 6600 ms, p99 63000 ms, 8.7 req/s | `results/load_stats.csv`, `artifacts/load-report.html` | **PASS** |
| S13-L02 | Load: p95 | same run | same | p95 <= 2000 ms | 2602 requests, error rate 0.0%, p50 2100 ms, p95 6600 ms, p99 63000 ms, 8.7 req/s (known defect SYS-D06) | `results/load_stats.csv`, `artifacts/load-report.html` | **FAIL** |
| S13-M | 390 px mobile pass (public pages) | deployed web | Playwright 390x844 | no sideways scroll | 3 PASS | `artifacts/playwright/s13-mobile-keyboard-S13-M0-9f514-t-sideways-scrolling-mobile-mobile-390/test-finished-1.png`, `artifacts/playwright/s13-mobile-keyboard-S13-M0-9fb80-t-sideways-scrolling-mobile-mobile-390/test-finished-1.png`, `artifacts/playwright/s13-mobile-keyboard-S13-M0-ed017-t-sideways-scrolling-mobile-mobile-390/test-finished-1.png` | **PASS** |
| S13-K | Keyboard-only navigation (sign-in) | deployed web | Tab/Enter only | every control reachable with visible focus | tab-order: Sign in with Google \| Sign in with Microsoft \| Other options \| (Enter) \| Email code (existing accounts) \| Back | `artifacts/playwright/s13-mobile-keyboard-S13-K0-c8453-able-with-the-keyboard-only-desktop/test-finished-1.png` | **PASS** |
| S13-A01..02 | Lighthouse accessibility (landing/sign-in and privacy) | deployed web | lighthouse 12.8.2 | >= 90 | 2 PASS | `artifacts/lighthouse-login.report.html`, `artifacts/lighthouse-privacy.report.html` | **PASS** |
| S13-I | Inbox page: mobile, keyboard, Lighthouse | signed-in test account | same on the inbox | same targets | BLOCKED: the inbox needs a signed-in test account (test accounts not created yet) | `results/playwright.xml` | **BLOCKED** |

## 14. Landing page

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S14-01 | Signed-out / lands on sign-in | deployed web | open / | /login | as expected | `artifacts/playwright/s14-landing-S14-01-signed--78af7-t-lands-on-the-sign-in-page-desktop/test-finished-1.png` | **PASS** |
| S14-02 | All links resolve | deployed web | request every link on /login, /privacy, /terms | no 4xx/5xx | 3 PASS | `artifacts/playwright/s14-landing-S14-02-every-link-on-login-resolves-desktop/test-finished-1.png`, `artifacts/playwright/s14-landing-S14-02-every-link-on-privacy-resolves-desktop/test-finished-1.png`, `artifacts/playwright/s14-landing-S14-02-every-link-on-terms-resolves-desktop/test-finished-1.png` | **PASS** |
| S14-03 | Page links stay on CategorAIze pages | deployed web | check link hosts | own host (and provider sign-in only) | as expected | `artifacts/playwright/s14-landing-S14-03-page-li-3f785-no-leftover-upstream-links--desktop/test-finished-1.png` | **PASS** |
| S14-04 | Protected routes redirect signed-out users | deployed web | open /welcome-redirect, /accounts, /setup, /settings | /login | 4 PASS | `artifacts/playwright/s14-landing-S14-04-signed--3586c-direct-redirects-to-sign-in-desktop/test-finished-1.png`, `artifacts/playwright/s14-landing-S14-04-signed-out-accounts-redirects-to-sign-in-desktop/test-finished-1.png`, `artifacts/playwright/s14-landing-S14-04-signed-out-settings-redirects-to-sign-in-desktop/test-finished-1.png` | **PASS** |
| S14-05 | Unknown page is a real 404 | deployed web | open a missing path | 404 page | as expected | `artifacts/playwright/s14-landing-S14-05-unknown-0c5e9--found-page-with-status-404-desktop/test-finished-1.png` | **PASS** |
| S14-07 | Not-found page has no upstream links | deployed web | check links | none to getinboxzero.com | upstream-links: https://docs.getinboxzero.com/ (known defect SYS-D04) | `artifacts/playwright/s14-landing-S14-07-the-not-48032-s-only-to-CategorAIze-pages-desktop/test-finished-1.png` | **FAIL** |
| S14-06 | Signed-in visitor redirect | signed-in test account | open / | app home | BLOCKED: needs a signed-in test account (test accounts not created yet) | `results/playwright.xml` | **BLOCKED** |

## 15. Final model evaluation (frozen test split)

| ID | Step | Preconditions | Steps | Expected | Actual | Evidence | Result |
|---|---|---|---|---|---|---|---|
| S15-01 | Test split evaluated once; result reproducible | frozen test split, models of the final run | re-score B4 to a separate file and compare | identical metrics | B4 re-scored on the frozen test split: 292 metrics, 0 differences; split sha256 b26928da73b9… | `results/eval-reproduction.json`, `fastapi_core/eval/RESULTS.md` | **PASS** |

## Defect log

| ID | Severity | Status | Blocking | Summary | Steps to reproduce | Fix |
|---|---|---|---|---|---|---|
| SYS-D01 | High | Fixed 2026-11-20 | Yes | Production NLP service has no `/health` route (image of 2026-11-18). The web status check gets 404, so the Priority Inbox shows "Smart sorting is unavailable" and disables Classify and Re-score, although classification works. | GET https://categoraize-nlp-35rdktlybq-as.a.run.app/health -> 404; `/healthz` is reserved by Cloud Run. | Redeployed `categoraize-nlp` from `main` (revision 00005); `/health` now returns 200 and S9-01 passes. |
| SYS-D05 | High | Fixed 2026-11-20 | Yes | Production web service has no `MICROSOFT_CLIENT_ID`/`SECRET`: no Microsoft sign-in, so no Outlook mailbox, Outlook Calendar or OneDrive. | Open /login and /login/options: only Google and email code; `gcloud run services describe categoraize` lists no MICROSOFT_* variables. | Added MICROSOFT_CLIENT_ID/SECRET/WEBHOOK_CLIENT_STATE to Cloud Run (revision 00028); the Azure app already accepts the production callback URL (S1-06). |
| SYS-D02 | Medium | Open | No | NLP `/docs`, `/redoc` and `/openapi.json` are public in production (endpoints themselves still require the key). | GET /docs, /openapi.json, /redoc without a key -> 200. | Create FastAPI with docs_url/redoc_url/openapi_url = None outside development. |
| SYS-D06 | Medium | Open | No | Under 50 concurrent users (1-3 s think time) the NLP p95 is 6.6 s (target 2 s), p99 63 s, throughput capped at 8.7 req/s; 0 errors. | locust -u 50 -t 5m against /classify and /priority (results/load_stats.csv). | Raise Cloud Run max instances (now 2) and/or CPU; consider concurrency 1 per instance for CPU-bound inference. |
| SYS-D07 | Medium | Open | No | Backups are not fully 3-2-1: Copy 1 (E:) and Copy 2 (D:) are both local, no off-site copy; Copy 1 is on the same disk as the live data. | Scheduled task arguments; backup log warning. | Point Copy 2 at a cloud-synced folder (Google Drive/OneDrive) or an external drive kept off-site. |
| SYS-D08 | Low | Open | No | Content-Security-Policy allows `'unsafe-inline'` and `'unsafe-eval'` in script-src, weakening XSS protection. | GET /login, read the CSP header. | Move to nonce-based script-src (Next.js supports nonces via middleware). |
| SYS-D03 | Low | Open | No | `X-Powered-By: Next.js` header advertises the framework. | GET /login headers. | `poweredByHeader: false` in next.config. |
| SYS-D04 | Low | Open | No | The not-found page links to the upstream Inbox Zero documentation (docs.getinboxzero.com); the same domain is in the page `<head>` help link and the user menu. | Open any missing path; see the Documentation link. | Point these links at CategorAIze help pages or remove them. |

Component-level defects D-01..D-05 are in `docs/testing/defects.md` (D-04 and D-05 are fixed on the branch, not yet in production).

## pnpm audit triage

| Severity | Package | Pulled in by | Why it is not reachable in production |
|---|---|---|---|
| high | browserslist <=4.28.6 | @serwist/next build tooling | build time only (service-worker build); not in the server bundle |
| high | electron <44.9.1 | apps/desktop | desktop app is not part of the deployed system |
| moderate | uuid <11.1.1 | @chat-adapter/teams > msal-node | Teams chat adapter not enabled; v3/v5/v6 with caller buffers not used |
| moderate | baseline-browser-mapping <2.11.0 | browserslist (build) | build time only |
| moderate | @hono/node-server <2.1.3 (serveStatic) | @modelcontextprotocol/sdk | MCP server does not use serveStatic |
| moderate | glob 9-14.0.1 | @sentry/nextjs bundler plugin | build time only |
| moderate | minimatch <11.0.1 | apps/desktop electron-builder | desktop build only |
| low | esbuild <0.28.1 | react-email preview server | dev server only |

## Evidence files

- `docs/testing/system/results/`: `api.xml` (pytest), `playwright.xml`, `prod-db-checks.txt`, `log-scan.json`, `gitleaks.json`, `pip-audit.json`, `pnpm-audit.json`, `load_stats.csv`, `s12-backup-log.txt`, `s12-restore-report.md`, `eval-reproduction.json`
- `docs/testing/system/artifacts/`: Playwright screenshots, `load-report.html`, Lighthouse HTML/JSON reports
- Model results: `fastapi_core/eval/RESULTS.md`
