# Multi-account test report: Google + Microsoft

Step 2–3 of the multi-account task. Audit: `docs/multi-account-audit.md`. Scripts and saved outputs: `scripts/test-multi-account/` (`results/`).
Branch `feat/phase-7-contacts-feedback` @ `4f931c9d0`, tested 2026-11-16. Nothing committed; no production code changed.

## Scope and deviations from the plan

- **Accounts.** The owner chose to test on their **real** Gmail (+ Google Calendar) instead of throwaway accounts. All tests stayed read-only: no mail sent, moved, labelled or deleted, no events or files created, addresses masked (`ja***@gmail.com`), schedules never printed (busy-period counts and "test window covered yes/no" only), no tokens printed.
- **Microsoft could not be connected.** The owner's Microsoft account signs in with the same Gmail address, which the fork rejects (finding X-2). The owner chose to skip the live Outlook tests, so every live Outlook row is **NOT TESTED**. Outlook behaviour that does not need a live mailbox (Graph busy-time format, broken Outlook token, OAuth registration) was still tested.
- **No ngrok / Pub/Sub**, so live new-mail arrival was not tested on either provider.
- **External AI stayed OFF** throughout (latest `CategorizeUserConsent.externalLlmEnabled = false`); attachment filing stayed OFF; no Drive/OneDrive connected.
- **Environment repairs during testing** (local only, no repo files changed): Docker Desktop would not start because of stuck AF_UNIX socket files (removed from inside the `docker-desktop` WSL distro); the local Redis HTTP proxy was recreated with the app's token (finding S-1).

Legend: **PASS**, **FAIL**, **PARTIAL** (works with a gap), **NOT SUPPORTED** (the fork cannot do it), **NOT TESTED** (could not be run here; reason given).

## Results

### Mail

| # | Test | Provider | Result | Evidence | File path |
|---|---|---|---|---|---|
| M-1 | Mailbox connected | Google | PASS | 1 Gmail `EmailAccount`, tz Asia/Manila (`results/inventory.txt`) | `utils/gmail/scopes.ts` |
| M-2 | Mailbox connect (Add account → Microsoft) | Microsoft | **NOT SUPPORTED** for this account (X-2) | Token exchange succeeded, 7/7 scopes granted, then `Create failed: account with this email already exists for a different provider` → `/accounts?error=account_already_exists` (`results/outlook-linking-log.txt`) | `utils/oauth/account-linking.ts:91-104`, `utils/outlook/oauth.ts:189` |
| M-3 | Azure app registration / redirect URI / Graph permissions | Microsoft | PASS | Same log: `Microsoft token exchange succeeded`, `missingScopes: []` | `utils/outlook/scopes.ts`, `app/api/outlook/linking/callback/route.ts` |
| M-4 | Initial sync → CategorAIze classification | Google | PARTIAL | 1 real message classified (44 other rows are `seed-*` demo data); sync volume not exercised | `utils/webhook/process-history-item.ts`, `utils/categoraize/process-email.ts` |
| M-5 | Initial sync | Microsoft | NOT TESTED | no Outlook mailbox | — |
| M-6 | New-mail arrival (webhook) | Google / Microsoft | NOT TESTED | needs public HTTPS (ngrok + Pub/Sub / Graph subscription); `utils/outlook/watch.ts` forces `https` on `NEXT_PUBLIC_BASE_URL` unless `WEBHOOK_URL` is set | `utils/outlook/watch.ts:10-15` |
| M-7 | Token refresh | Google (calendar token) | PASS | `Calendar tokens saved successfully` during `calendar-busy.ts` | `utils/calendar/client.ts` |
| M-8 | Token refresh | Microsoft | NOT TESTED (live); refresh failure path PASS (C-6) | — | `utils/outlook/calendar-client.ts` |
| M-9 | CATZ-TEST content through the service with the account's own context | Google | PASS | "by Friday 5pm" → `2026-11-20T17:00+08:00`; TASK span found; Taglish email `language: mixed` (`results/classify-google.txt`) | `scripts/test-multi-account/classify-equivalence.ts` |
| M-10 | Same content gives equivalent results from either provider | both | PASS at service level; live Outlook NOT TESTED | The service gets only text + account context, never the provider; A→B→A requests identical (`results/service-checks.txt`, statelessness) | `fastapi_core/app/main.py`, `utils/categoraize/process-email.ts` |
| M-11 | "Register" returned by classify | both | NOT SUPPORTED | `ClassifyResponse` has language, category, spans, priority — no register/formality field | `fastapi_core/app/schemas.py:126-136` |

### Calendar

| # | Test | Provider | Result | Evidence | File path |
|---|---|---|---|---|---|
| C-1 | Read busy periods, next 7 days | Google | PASS | OK in ~1 s, tz-aware ISO strings; 0 periods (the CATZ-TEST Friday event was not created, so "window covered" = NO). One secondary calendar returns `notFound` and is skipped without failing (`results/calendar-busy-google.txt`) | `utils/calendar/providers/google-availability.ts` |
| C-2 | Read busy periods, next 7 days | Microsoft | NOT TESTED (live) | no Outlook calendar | `utils/calendar/providers/microsoft-availability.ts` |
| C-3 | Busy-time wire format accepted by the service | Google / Microsoft | PASS | Google `…Z` and Graph `…0000000Z` both give +1 (`results/service-checks.txt`) | `microsoft-availability.ts:55-67`, `fastapi_core/app/schemas.py:56-58` |
| C-4 | +1 boost when deadline is inside a busy period | both | PASS | level 3 → 4, `factors.calendar = 1`, identical for both formats | `fastapi_core/app/ml/priority_rules.py:44-46` |
| C-5 | No calendar / empty / failed → neutral, never lower | both | PASS | `null` and `[]` → calendar 0, same level; no variant below the no-calendar level | `priority_rules.py:44`, `utils/categoraize/calendar-busy.ts` |
| C-6 | One broken token, the other keeps working | Google + Microsoft (fake tokens) vs real Google | PASS | fake Google → `invalid_grant`, fake Outlook → "authorization has expired", real Google read OK in the same run; 0 real connections marked disconnected (`results/failure-isolation-google.txt`) | `utils/calendar/unified-availability.ts` (per-provider `.catch → []`) |
| C-7 | UI error state for a broken calendar | both | NOT TESTED | would require revoking a real token; not done on a real account | — |
| C-8 | Partial failure is visible | both | PARTIAL (code) | a failing provider returns `[]` inside `getUnifiedCalendarAvailability`, so `calendar-busy.ts` never reaches its own `catch`/warn and caches the partial result 10 min. Neutral, but silent | `utils/categoraize/calendar-busy.ts:33-52` |
| C-9 | Same meeting in both calendars not double-counted | both | PASS | both formats in one request → +1, not +2 | `priority_rules.py:46` (`any()`) |
| C-10 | Asia/Manila deadline resolves correctly | Google (tz set) | PASS | `2026-11-20T17:00:00+08:00` | `process-email.ts:277-313` |
| C-11 | Asia/Manila deadline when the mailbox has no time zone (Outlook default) | Microsoft | **FAIL (likely)** | Service test: tz `UTC` → `17:00Z` (8 h late) and the Manila meeting's boost is lost. Outlook calendars are saved with `timezone: null`, so `autoPopulateTimezone` has nothing to copy for an Outlook-only mailbox. Not confirmed live | `utils/calendar/providers/microsoft.ts:97,105`, `utils/calendar/timezone-helpers.ts` |
| C-12 | Calendar boost uses all of the user's calendars | both | PARTIAL (code) | busy periods come only from calendars attached to the **same** email account; a Gmail email ignores an Outlook calendar attached to the Outlook mailbox | `calendar-busy.ts:30`, `unified-availability.ts` (`where: { emailAccountId }`) |

### Files (attachment filing)

| # | Test | Provider | Result | Evidence | File path |
|---|---|---|---|---|---|
| F-1 | List/search Drive | Google | NOT TESTED | no Drive connected (owner kept filing off); note default `drive.file` scope only sees app-created files | `utils/drive/providers/google.ts`, `utils/drive/scopes.ts` |
| F-2 | List/search OneDrive / SharePoint | Microsoft | NOT TESTED; SharePoint PARTIAL (code) | no Microsoft account; `Files.ReadWrite` only (no `Sites.*`) | `utils/drive/providers/microsoft.ts` |
| F-3 | With external AI OFF, the filing AI step is disabled | both | **FAIL** | No consent check on the filing path; gate is only `filingEnabled && filingPrompt` (`results/filing-consent.txt`) | `utils/drive/filing-engine.ts:93`, `utils/ai/document-filing/analyze-document.ts:86`, `parse-filing-reply.ts:89` |
| F-4 | Nothing else breaks with filing off | Google | PASS | filing off; mail classification and calendar unaffected | — |

### Cross-account

| # | Test | Result | Evidence | File path |
|---|---|---|---|---|
| X-1 | CategorAIze data scoped per email account (categories, centroids, overrides, contacts, spans, alerts) | PASS (code + DB) | every CategorAIze table has `emailAccountId`; ISO-1…ISO-9 = 0 (`results/isolation-1-account.txt`). Only one mailbox is connected, so this shows consistency, not live isolation | `prisma/schema.prisma:2997-3316`, `scripts/test-multi-account/isolation.sql` |
| X-2 | Same address on Google and Microsoft can be connected together | **NOT SUPPORTED** | `EmailAccount.email` is `@unique`; linking returns `account_already_exists` | `prisma/schema.prisma:157`, `utils/oauth/account-linking.ts:91-104` |
| X-3 | Same sender / same category names in two accounts don't collide | PASS | service echoes per-request ids (`acctA-cat` vs `acctB-cat`); DB keys `@@unique([emailAccountId, name])`, `@@unique([emailAccountId, email])` | `schema.prisma:3026,3156` |
| X-4 | Parallel sync: no duplicated/mixed records | PARTIAL | ISO-7/ISO-8 = 0; queue dedup `emailAccountId:threadId:messageId`, upsert on the same key. Not exercised with two live mailboxes | `utils/categoraize/queue.ts`, `process-email.ts:138` |
| X-5 | Consent / external-AI switch | PASS by design, note | one switch per **user**: turning external AI on from one mailbox's settings turns it on for every mailbox | `utils/categoraize/consent.ts`, `schema.prisma:3251` |
| X-6 | NLP service stateless | PASS | A→B→A identical; no DB/Redis client in `fastapi_core/app` | `results/service-checks.txt` |
| X-7 | Service receives only busy start/end, never tokens | PASS | busy period with `access_token` → 422; top-level `refresh_token` → 422; naive datetimes → 422; wrong `X-Internal-Key` → 401 | `fastapi_core/app/schemas.py:25-26,56-58` |

### Setup findings

| # | Finding | Result | Evidence | File path |
|---|---|---|---|---|
| S-1 | Local Redis HTTP proxy created with an **empty** token | FAIL (fixed locally) | `SRH_TOKEN: ${REDIS_HTTP_TOKEN:-…}` is interpolated from the shell / root `.env`, not from `env_file`; container SRH_TOKEN hash = sha256(""). Effect: every OAuth callback logged "deduplication unavailable" and the Outlook linking callback crashed with `UpstashError: Invalid token` (`route.ts:130`). Recreated only that container with the app token; PING → PONG | `docker-compose.yml:42-58`, `app/api/outlook/linking/callback/route.ts:130` |
| S-2 | Docker Desktop failed to start | environment, not repo | stuck AF_UNIX socket files (`Docker\run\dockerInference`, `docker-secrets-engine\engine.sock`) returned Windows error 1920; removed from inside WSL | — |

### NLP observations (not multi-account, recorded for completeness)

- `CATZ-TEST 2 newsletter`: the subject was tagged as a TASK and "webinars" as a DATE (false positives).
- `CATZ-TEST 3 taglish request`: "bago mag-Thursday" was tagged as a DATE but not resolved, so no deadline was set.
- The CATZ-TEST subject prefix itself was tagged as TASK in two emails; the prefix may need excluding from tagging in test data.

## Fixes applied (2026-11-16, after the report; uncommitted)

The owner asked for every gap to be fixed. Status of each row in the table below:

| Gap | Change | Verified by |
|---|---|---|
| F-3 filing consent | `processAttachment` returns `skipped` before any download or LLM call when `isExternalLlmAllowed(userId)` is false; `processFilingReply` does not call `aiParseFilingReply` without consent. `docs/llm-call-sites.md` updated | new tests in `utils/drive/filing-engine.test.ts`, `handle-filing-reply.test.ts`; `check-filing-consent.sh` now PASS (`results/filing-consent-after-fix.txt`) |
| C-11 Outlook time zone | new `utils/categoraize/mailbox-timezone.ts`: mailbox tz → Outlook `/me/mailboxSettings/timeZone` (Windows→IANA, saved once) → the user's other mailbox → UTC; used by `process-email.ts` | `mailbox-timezone.test.ts` (5 cases + mapping); all 63 mapped zones valid in `Intl`; Google classify unchanged (`results/classify-google-after-fix.txt`). Live Outlook not tested |
| C-12 calendars across mailboxes | `calendar-busy.ts` reads every calendar connected under any mailbox of the same user; cache keyed by user | `calendar-busy.test.ts`; live Google read unchanged (`results/calendar-busy-google-after-fix.txt`) |
| C-8 silent partial failure | per mailbox: fail-closed first, then fail-open; a partial result logs "Some calendars were unavailable…" and is cached 1 min instead of 10; all-failed returns `null` (neutral) | `calendar-busy.test.ts` |
| X-2 same address | linking now returns `email_in_use_by_other_provider` for the same user's address on the other provider; `/accounts` explains it and how to use an Outlook.com alias (de/es/fr/pt-BR translated) | `account-linking.test.ts` (new case). UI text not checked in a browser |
| S-1 Redis token, M-6 ngrok | documented in `docs/categoraize-local-multi-account-setup.md` (`--env-file apps/web/.env`, `WEBHOOK_URL`, Pub/Sub push); personal-account note added to `docs/hosting/microsoft-oauth.mdx` | docs only; `docker-compose.yml` unchanged |
| M-11 register, NLP tagger observations | not changed: need a product decision / NLP work outside this task | — |

Tests: `vitest run utils/categoraize utils/drive utils/oauth utils/calendar app/api/outlook app/api/google app/api/user/drive "app/(app)/accounts" utils/actions/drive` → 56 files, 444 tests passed. `tsc --noEmit` reports errors only in files this change did not touch. `service-checks.ts` still 21/21.

## Prioritized gaps and proposed fixes

Original proposals (before the fixes above). Sizes: XS < 2 h, S ≈ ½–1 day, M ≈ 2–3 days.

| Priority | Gap | Proposed fix | Size | Phase |
|---|---|---|---|---|
| 1 | **F-3** Attachment filing sends documents to the external LLM even when external AI is OFF | Call `isExternalLlmAllowed(userId)` in `processAttachment` before `analyzeDocument`, and in the filing-reply path before `parseFilingReply`; skip with a clear "external AI is off" filing status; unit tests | S | **Phase 0.5** LLM inventory (update `docs/llm-call-sites.md`) |
| 2 | **S-1** Redis proxy token empty unless `REDIS_HTTP_TOKEN` is exported before `docker compose up` | Document `docker compose --env-file apps/web/.env --profile local-redis up -d` (or a root `.env`) in the setup guide / `dev-env.ps1`; add a startup check that pings the proxy | XS | **Phase 0.4** setup |
| 3 | **C-11** Outlook-only mailbox has no time zone → deadlines resolve in UTC (8 h late for Manila) and the calendar boost misses | On Outlook connect, read Graph `mailboxSettings.timeZone` (Windows name → IANA mapping) into `EmailAccount.timezone`; else fall back to the user's other mailbox or ask in onboarding | S | **Phase 6** calendar |
| 4 | **X-2** A Microsoft account that uses a Gmail address cannot sit beside that Gmail | Short term: document "use an outlook.com/Microsoft 365 address" in setup and show a clearer error on `/accounts`. Long term (out of scope): key mailboxes by provider + address | XS (doc) / M (code) | **Phase 0.4** setup |
| 5 | **C-12** Boost ignores the user's other mailbox's calendar | Decide whether the boost should union all calendars of the **user**; if yes, query `calendarConnection` across the user's email accounts in `calendar-busy.ts` (privacy note in the consent text) | M | **Phase 6** calendar |
| 6 | **C-8** Partial calendar failure is silent and cached for 10 min | Have `calendar-busy.ts` use a per-provider result (or `failClosed` per provider) so a failure logs a warning and is cached briefly (e.g. 1 min); keep the result neutral | S | **Phase 6** calendar |
| 7 | **M-6** No live new-mail test locally | Add ngrok + `WEBHOOK_URL` + Pub/Sub push steps to the local setup guide | XS | **Phase 0.4** setup |
| 8 | **M-11** "Register" not produced by classify | Confirm whether register is still a requirement; if so add it to `ClassifyResponse` | — (decision) | — (NLP plan, outside 0.4/0.5/6) |
| 9 | Tagger false positives and unresolved Taglish "bago mag-<day>" | Add to tagger evaluation set (synthetic data only) | — | — (NLP tagger, outside 0.4/0.5/6) |

## Still open if Outlook is connected later

Connect an Outlook mailbox that uses its own outlook.com address (see X-2), create the Friday 16:00–18:00 Asia/Manila busy event in both calendars, send the three CATZ-TEST emails to both mailboxes, then rerun with `CATZ_TEST_EMAILS=<gmail>,<outlook>`: `inventory.ts` (check the Outlook mailbox time zone, C-11), `calendar-busy.ts`, `classify-equivalence.ts`, `failure-isolation.ts`, `isolation.sql`. Rows M-5, M-8, C-2, C-7, F-1, F-2 and live X-1/X-4 become testable.

## Commands used

Environment (PowerShell): `. E:\categoraize\dev-env.ps1`

```bash
# NLP service (key read from apps/web/.env, never printed)
cd fastapi_core && CATEGORAIZE_INTERNAL_KEY=<from apps/web/.env> .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# Scripts (from apps/web)
export NODE_ENV=development TSX_TSCONFIG_PATH=../../scripts/test-multi-account/tsconfig.json
export CATZ_TEST_EMAILS=<mailbox addresses to test>
node --env-file=.env --import tsx ../../scripts/test-multi-account/inventory.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/service-checks.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/calendar-busy.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/classify-equivalence.ts
node --env-file=.env --import tsx ../../scripts/test-multi-account/failure-isolation.ts

# From the repo root
docker exec -i inbox-zero-services-db-1 psql -U postgres -d inboxzero -At < scripts/test-multi-account/isolation.sql
bash scripts/test-multi-account/check-filing-consent.sh

# S-1 local fix (recreates only the stateless Redis HTTP proxy)
REDIS_HTTP_TOKEN=<from apps/web/.env> docker compose -p inbox-zero-services --profile local-redis up -d --no-deps --force-recreate serverless-redis-http
```
