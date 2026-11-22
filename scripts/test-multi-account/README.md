# Multi-account tests (Google + Microsoft)

Read-only checks for CategorAIze with a Gmail and an Outlook mailbox connected at once. See `docs/multi-account-audit.md` (what was audited) and `docs/multi-account-test-report.md` (results).

Rules the scripts follow: no send/delete/move/label, no calendar events or files created, no tokens printed, real schedules never printed (busy-period counts and "CATZ-TEST window covered" only), addresses masked. Only the mailboxes listed in `CATZ_TEST_EMAILS` are touched.

## Prerequisites

- Docker DB `inbox-zero-services-db-1` running; NLP service on `:8000` (`fastapi_core`, `uvicorn app.main:app --port 8000` with `CATEGORAIZE_INTERNAL_KEY` set).
- `apps/web/.env` with `CATEGORAIZE_SERVICE_URL` / `CATEGORAIZE_INTERNAL_KEY`.
- PowerShell: `. E:\categoraize\dev-env.ps1`

## Run (from `apps/web`, PowerShell)

```powershell
$env:NODE_ENV = "development"
$env:TSX_TSCONFIG_PATH = "../../scripts/test-multi-account/tsconfig.json"
$env:CATZ_TEST_EMAILS = "<gmail>,<outlook>"
node --env-file=.env --import tsx ../../scripts/test-multi-account/inventory.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/service-checks.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/calendar-busy.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/classify-equivalence.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/failure-isolation.ts
```

From the repo root (bash):

```bash
docker exec -i inbox-zero-services-db-1 psql -U postgres -d inboxzero -At < scripts/test-multi-account/isolation.sql
bash scripts/test-multi-account/check-filing-consent.sh
```

| Script | Test | Touches a mailbox? |
|---|---|---|
| `inventory.ts` | what is connected per account, consent | DB only (counts, masked) |
| `service-checks.ts` | calendar boost/neutral, Google vs Outlook busy format, duplicate meeting, UTC vs Manila, token fields rejected, statelessness | no (service only) |
| `calendar-busy.ts` | 7-day free/busy per calendar, CATZ-TEST window found, what is sent to the service | calendar free/busy (read) |
| `classify-equivalence.ts` | same CATZ-TEST content through each account's context; nothing stored | calendar free/busy (read) |
| `failure-isolation.ts` | broken token on one side (fake tokens) vs real side | calendar free/busy (read) |
| `isolation.sql` | cross-account foreign-key leaks, duplicates | DB only |
| `check-filing-consent.sh` | filing LLM consent gate | code only |

The CATZ-TEST window defaults to next Friday 16:00-18:00 Asia/Manila; override with `CATZ_TEST_WINDOW=<startISO>/<endISO>`. Saved outputs are in `results/`.
