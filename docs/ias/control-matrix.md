# IAS control matrix

Status as of 2026-11-17 (Phase 7 "IAS foundation", branch
`feat/phase-7-ias-foundation`; Phase 0 rows kept where nothing changed).
**Built** means the control exists in code **and** an automated test for it
passes. Anything else is **Partial** (some of it exists, no test, or it covers
only part of the claim) or **Planned**. Paths are relative to `apps/web/`
unless they start with `fastapi_core/`, `scripts/` or `docs/`.

The rows come from the master plan (sections 2, 9 and 12) and PRD Module 2
(FR-2.1 to FR-2.4). The IAS document itself was not available during this
audit; add one row per claim from it where it says more than the rows below.
Phase 7 documents: `docs/ias/incident-response.md`, `docs/ias/bcp.md`,
`docs/ias/zero-trust-mapping.md`, `docs/ias/key-management.md`,
`docs/oauth-scope-review.md`, `docs/recovery-runbook.md`,
`docs/backup-report.md`.

## Confidentiality

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | OAuth tokens are encrypted at rest | AES-256-GCM Prisma extension, scrypt-derived key from `EMAIL_ENCRYPT_SECRET`/`EMAIL_ENCRYPT_SALT`, versioned `v1:` ciphertext | `utils/encryption.ts`, `utils/prisma-extensions.ts` | upstream unit tests `utils/encryption.test.ts` (to run in Phase 7) | Local DB: 1/1 Account and 1/1 CalendarConnection tokens stored as `v1:` ciphertext (2026-11-16) | Partial (decrypt passes plaintext through; tests not yet run under this matrix) |
| C2 | Stored email text is encrypted (FR-2.2) | none yet | `CategorizeClassification.bodyText`, `.snippet`, `.subject`, `.summary`; `CategorizeExtractedSpan.text` | none | 45/45 classification rows hold plaintext `bodyText`. Backups leave these columns out (A1) | Planned (Phase 11 I) |
| C3 | PII is masked before the NLP service, storage and the LLM (FR-2.1) | none yet | n/a | none | n/a | Planned (Phase 11 J) |
| C4 | Row-level security isolates tenants at the database (FR-2.3) | none; local role `postgres` is superuser with BYPASSRLS | n/a | none | `rolsuper=t, rolbypassrls=t` locally | Planned (Phase 11 K) |
| C5 | Supabase public API cannot read app tables | RLS enabled with no policies on app tables | n/a | none | App currently runs on local Docker Postgres, not Supabase | Planned (Phase 0.4 / 7) |
| C6 | Every CategorAIze route and action checks the session owns the email account | `withEmailAccount` / `withAuth` middleware; `actionClient` ownership check; every row lookup in CategorAIze actions filtered by the verified `emailAccountId` | `utils/middleware.ts`, `utils/actions/safe-action.ts`, `app/api/categorai/*`, `utils/actions/categoraize*.ts` | `app/api/categorai/isolation.test.ts` (21), `utils/actions/categoraize-isolation.test.ts` (27) | 2026-11-17: 48/48 pass. As user A: 9 routes return 403 for B's account before any CategorAIze query and only query A's rows; 15 actions refuse B's account; 9 row-ID actions refuse B's rows on A's own account; consent and security-log routes read only the session user. `/process` is internal (QStash/internal key) and not covered | Built |
| C7 | Upstream routes are authenticated | middleware wrappers, cron secret, QStash/`@vercel/queue`, webhook verification, signed OAuth state | 303 routes under `app/api` | none | 261 use a known wrapper; 42 delegate to helpers (queue forwarders, OAuth callbacks, public booking links, webhooks) and need a manual review | Partial |
| C8 | The NLP service receives no tokens and stores no email content | stateless service; payload has text, labels, busy start/end only | `utils/categoraize/client.ts`, `fastapi_core/app/main.py` | `fastapi_core/tests/test_api_guards.py` (auth) | Multi-account audit: only `{start,end}` busy pairs are sent | Partial (no test asserts "no token fields") |
| C9 | NLP service rejects callers without the internal key | `X-Internal-Key`, fail closed when unset | `fastapi_core/app/main.py` | `fastapi_core/tests/test_api_guards.py` | pytest passes. The web app now records `nlp_auth_failure_count` audit events on HTTP 401 | Built (constant-time compare, rate limit: Planned, Phase 10 H) |
| C10 | No secrets in the repository | `.gitignore` covers `.env*`; upstream `.gitleaks.toml` | `.gitignore`, `.gitleaks.toml` | `gitleaks git . --config .gitleaks.toml --redact` (v8.30.1, full history) and a `git grep` pattern scan | gitleaks: 6 findings, all example/test values committed by upstream contributors; only a placeholder in `apps/web/.env.example` remains in the tree. gitleaks has **no rule for Postgres URLs**, so it missed C10a. Backup key kept outside the repo (`docs/ias/key-management.md`) | **Failing** (until C10a is resolved) |
| C10a | | | `docs/plans/deployment-environment-setup.md:344` | `git log -G` history scan | The live Supabase production password (same value as the commented production URLs in `apps/web/.env`) was committed in `b049db249` (2026-10-20) and is on the **public** GitHub repo (`main`, `chore/remove-marketing`, `delete-files`, `feature/prd-v7-inbox-zero-parity`). Replaced with a placeholder in the tree on 2026-11-16 (`c32fc7689`); still in history | **Failing: reset the password in Supabase** |
| C11 | Least-privilege OAuth scopes | scope lists per feature; review with KEEP/REMOVE/ASK per scope | `utils/gmail/scopes.ts`, `utils/outlook/scopes.ts`, `utils/drive/scopes.ts`, `docs/oauth-scope-review.md` | none | Review done 2026-11-17; nothing removed. Two redundant pairs (Microsoft `Calendars.Read` + `Calendars.ReadWrite`; Google `calendar.freebusy` + `calendar.readonly`); write scopes, `gmail.settings.basic`, contacts, `Mail.Send` and full Drive serve upstream features only | Partial (owner decisions pending) |

## Integrity

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | OAuth flows resist CSRF and code interception | signed OAuth state (HMAC, `secureCompare`, nonce, cookie match); PKCE on social sign-in | `utils/oauth/state.ts`, `utils/oauth/callback-validation.ts`, `utils/auth.ts` (`pkce: true`) | upstream tests in `utils/oauth/*.test.ts` | code read | Partial (tests not yet run under this matrix) |
| I2 | Rocchio feedback cannot be corrupted by zero vectors or duplicate feedback | guards in the service and a unique feedback key | `fastapi_core/app/algorithms/feedback.py`, `CategorizeFeedbackEvent` | `fastapi_core/tests/test_scenario5_rocchio.py` | pytest passes | Built |
| I3 | Append-only audit log of security events | `CategorizeAuditEvent` with a trigger rejecting UPDATE, DELETE and TRUNCATE; `recordAuditEvent` never throws; `sanitizeAuditMetadata` drops token/secret/password/IP/content keys; read-only Security log page | `prisma/migrations/20261116120000_categoraize_audit_log`, `utils/categoraize/audit.ts`, `app/(app)/[emailAccountId]/categoraize/security/`, `app/api/user/audit-events/route.ts` | `utils/categoraize/audit.test.ts` (7); append-only check in `scripts/backup/restore-test.ps1` | 2026-11-17: unit tests pass; on the restored scratch copy INSERT works and UPDATE, DELETE, TRUNCATE are rejected (`docs/backup-report.md`). Events: login, logout, account connected/disconnected, consent accepted/withdrawn, external LLM toggled, OAuth scope changed, data deletion requested/completed, backup run, restore test, NLP auth failures | Built (each event hook is not individually tested; `export_requested` waits for P4) |
| I4 | Backups are checked for tampering before restore | SHA-256 checksum file per set, verified before decryption; age authenticated encryption; restore refuses on mismatch | `scripts/backup/restore-test.ps1`, `scripts/backup/common.ps1` | tamper test in `restore-test.ps1` | 2026-11-17: a one-byte change is refused by the checksum; with a rewritten checksum file it is refused by age (`docs/backup-report.md`) | Built |
| I5 | Security headers | X-Frame-Options, nosniff, Referrer-Policy, HSTS, enforced CSP (`frame-ancestors 'none'`) | `next.config.ts` | none | code read; Permissions-Policy absent | Partial (Phase 10 H) |
| I6 | Dependencies have no known high or critical issues | `pnpm audit --prod`; `pip-audit` (2.10.1) on `fastapi_core/.venv` | `pnpm-lock.yaml`, `fastapi_core/requirements*.txt` | audits run 2026-11-16 | npm: 3 high (zod <4.6.6 memory exhaustion, prosemirror-view <1.42.3 paste XSS, source-map-js <1.2.2 DoS), 4 moderate, 1 low. Python: 88 packages, issues only in tooling (pip 24.2, setuptools 78.1.0, pytest 8.4.2); runtime packages (fastapi, torch, sentence-transformers, ...) clean | **Failing** |

## Availability

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 3-2-1 backup, RPO 24 h | `backup.ps1`: redacted rows (no email text, no tokens) + full schema, pg_dump 16.15 custom format, age encryption, SHA-256, two copies, dated read-only names, 7 daily + 4 weekly retention, `backup_run` audit event | `scripts/backup/backup.ps1`, `scripts/backup/common.ps1`, `docs/recovery-runbook.md` | three local runs; redaction re-checked on every run | 2026-11-16/17: 3 runs PASS (127 to 147 s); retention checked on 60 synthetic sets. Daily Task Scheduler entry **not registered**; Copy 1 and Copy 2 are placeholder folders **on the same disk** | Partial (owner: register the task, point copies at the external drive and the cloud folder) |
| A2 | Restore tested, RTO 4 h | `restore-test.ps1` into a new scratch container; row counts against the manifest | `scripts/backup/restore-test.ps1`, `docs/backup-report.md` | `restore-test.ps1` | 2026-11-17: PASS, 19/19 tables match, data restore 113 to 115 s. Full-service RTO (secrets, app, reconnecting mailboxes) not drilled | Built (data restore); full drill Partial |
| A3 | Mail still opens when the NLP service is down | service status banner, neutral "Not yet analyzed" state, per-feature fallback | `components/CategoraizeStates.tsx`, `utils/categoraize/features.ts` | `utils/categoraize/features.test.ts` (fallback switches) | browser-checked in earlier phases; no failure drill in Phase 7 | Partial |
| A4 | Rate limiting on new routes and the NLP service | only public booking links and email OTP are rate-limited | `utils/booking/public-rate-limit.ts`, `utils/auth/email-otp.ts` | upstream tests | code read | Planned (Phase 10 H) |
| A5 | Incident response plan (ransomware, RA 10173 72-hour notice) | NIST SP 800-61 phases with commands for this repo; NPC notice criteria and template | `docs/ias/incident-response.md` | none (tabletop not held) | written 2026-11-17 | Partial |
| A6 | Business continuity: critical function, restore order, RTO/RPO | BCP with measured restore times | `docs/ias/bcp.md` | restore test (A2) | RPO not met until A1 is scheduled; `fastapi_core/models/tagger/v7/` is untracked and not backed up | Partial |

## Privacy and data rights (RA 10173)

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Terms and Privacy Notice accepted before any mailbox is read | first-login gate (app layout redirects to `/consent`); watches only for users with current consent; webhooks skip the rest; draft `/terms` and `/privacy` pages; consent versions `2026-11-16-draft` | `utils/categoraize/consent.ts`, `app/(app)/layout.tsx`, `app/(landing)/consent/`, `utils/email/watch-manager.ts`, `utils/webhook/validate-webhook-account.ts` | `utils/categoraize/consent.test.ts` (8): gate off, withdrawn and old-version rows, other users' rows, user filter | 2026-11-17: unit tests and the webhook/watch-manager suites pass. Redirect and consent page **not checked in a browser**; legal text is a draft | Partial (browser check and final legal text) |
| P2 | External-LLM processing is opt-in and off by default | `CategorizeUserConsent.externalLlmEnabled`, `assertExternalLlmAllowed` gate on drafts, follow-ups and LLM fallbacks; changing it needs active consent | `utils/categoraize/consent.ts`, `utils/categoraize/features.ts`, `utils/actions/categoraize-consent.ts` | none specific | Attachment filing and assistant chat are **not** gated (filing: multi-account audit F-2; chat and Telegram: by decision) | Partial |
| P3 | Users can withdraw consent and see their choices | Settings > Privacy card: review versions and date, withdraw (marks every row), link to the Security log; `external_llm_toggled` and `consent_*` audit events | `app/(app)/[emailAccountId]/assistant/settings/ConsentSetting.tsx`, `utils/actions/categoraize-consent.ts` | `utils/actions/categoraize-isolation.test.ts` (withdraw touches only the session user's rows) | UI not checked in a browser | Partial |
| P4 | Data export | none | n/a | none | n/a | Planned (Phase 10 G) |
| P5 | Erasure with token revocation (FR-2.4) | `deleteUser` removes rows; all CategorAIze tables cascade from `EmailAccount`/`User`; `data_deletion_requested/completed` audit events; runbook re-applies erasures after a restore | `utils/user/delete.ts`, `prisma/schema.prisma`, `docs/recovery-runbook.md` | upstream tests | no provider token revocation in the deletion path | Partial (Phase 10 G) |
| P6 | Shared models never train on real Gmail-derived data | tagger trained only on synthetic, Claude-written and LLM-generated data; Rocchio centroids stay per account | `fastapi_core/training/`, `fastapi_core/data/` | training data provenance in `fastapi_core/README.md` | no real mail in training sets | Partial (no automated provenance check) |

## Zero trust mapping (summary; full mapping in `docs/ias/zero-trust-mapping.md`)

| Principle | Current control | Gap |
| --- | --- | --- |
| Verify explicitly | session middleware per route and action with ID-tampering tests (C6); signed OAuth state; internal key on the NLP service | 42 upstream routes reviewed by helper only; no RLS |
| Least privilege | `drive.file` default scope; NLP service gets no tokens; scope review (C11); backups hold no tokens or email text | calendar write scopes and upstream-only scopes pending owner decisions; app DB role can bypass RLS |
| Assume breach | tokens encrypted at rest; append-only audit log (I3); encrypted backups with tamper checks and a tested restore (I4, A2); incident response plan (A5) | email text in plaintext (C2); backups not yet scheduled or on separate media (A1); leaked DB password on GitHub (C10a) |
