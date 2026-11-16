# IAS control matrix

Status as of 2026-11-16 (Phase 0 discovery, branch `feat/phase-0-ias-audit`).
**Built** means the control exists in code **and** an automated test for it
passes. Anything else is **Partial** (some of it exists, no test, or it covers
only part of the claim) or **Planned**. Paths are relative to `apps/web/`
unless they start with `fastapi_core/`, `scripts/` or `docs/`.

The rows come from the master plan (sections 2, 9 and 12) and PRD Module 2
(FR-2.1 to FR-2.4). The IAS document itself was not available during this
audit; add one row per claim from it (CIA table, incident response, 3-2-1
backup, RPO/RTO, zero trust) where it says more than the rows below.

## Confidentiality

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | OAuth tokens are encrypted at rest | AES-256-GCM Prisma extension, scrypt-derived key from `EMAIL_ENCRYPT_SECRET`/`EMAIL_ENCRYPT_SALT`, versioned `v1:` ciphertext | `utils/encryption.ts`, `utils/prisma-extensions.ts` | upstream unit tests `utils/encryption.test.ts` (to run in Phase 7) | Local DB: 1/1 Account and 1/1 CalendarConnection tokens stored as `v1:` ciphertext (2026-11-16) | Partial (decrypt passes plaintext through; tests not yet run under this matrix) |
| C2 | Stored email text is encrypted (FR-2.2) | none yet | `CategorizeClassification.bodyText`, `.snippet`, `.subject`, `.summary`; `CategorizeExtractedSpan.text` | none | 45/45 classification rows hold plaintext `bodyText` | Planned (Phase 11 I) |
| C3 | PII is masked before the NLP service, storage and the LLM (FR-2.1) | none yet | n/a | none | n/a | Planned (Phase 11 J) |
| C4 | Row-level security isolates tenants at the database (FR-2.3) | none; local role `postgres` is superuser with BYPASSRLS | n/a | none | `rolsuper=t, rolbypassrls=t` locally | Planned (Phase 11 K) |
| C5 | Supabase public API cannot read app tables | RLS enabled with no policies on app tables | n/a | none | App currently runs on local Docker Postgres, not Supabase | Planned (Phase 0.4 / 7) |
| C6 | Every new API route checks the session owns the email account | `withEmailAccount` / `withAuth` middleware | `utils/middleware.ts`, `app/api/categorai/*` | none specific | 10/11 CategorAIze routes use `withEmailAccount`, 1 (`/process`) verifies a QStash signature, consent route uses `withAuth` | Partial (no ID-tampering tests) |
| C7 | Upstream routes are authenticated | middleware wrappers, cron secret, QStash/`@vercel/queue`, webhook verification, signed OAuth state | 303 routes under `app/api` | none | 261 use a known wrapper; 42 delegate to helpers (queue forwarders, OAuth callbacks, public booking links, webhooks) and need a manual review | Partial |
| C8 | The NLP service receives no tokens and stores no email content | stateless service; payload has text, labels, busy start/end only | `utils/categoraize/client.ts`, `fastapi_core/app/main.py` | `fastapi_core/tests/test_api_guards.py` (auth) | Multi-account audit: only `{start,end}` busy pairs are sent | Partial (no test asserts "no token fields") |
| C9 | NLP service rejects callers without the internal key | `X-Internal-Key`, fail closed when unset | `fastapi_core/app/main.py` | `fastapi_core/tests/test_api_guards.py` | pytest passes | Built (constant-time compare, rate limit and 401 counting: Planned, Phase 10 H) |
| C10 | No secrets in the repository | `.gitignore` covers `.env*`; upstream `.gitleaks.toml` | `.gitignore`, `.gitleaks.toml` | `git grep` pattern scan (current tree clean except C10a) | see C10a | **Failing** |
| C10a | | | `docs/plans/deployment-environment-setup.md:344` | history scan | A Supabase connection string with a real-looking password (17 chars) is in commit `b049db249` (2026-10-20), in the current tree, and on the **public** GitHub repo (`main`, `chore/remove-marketing`, `delete-files`, `feature/prd-v7-inbox-zero-parity`) | **Failing: rotate the password** |
| C11 | Least-privilege OAuth scopes | scope lists per feature | `utils/gmail/scopes.ts`, `utils/outlook/scopes.ts`, `utils/drive/scopes.ts` | none | Calendar requests write scopes (`calendar.events`, `Calendars.ReadWrite`) though CategorAIze only reads busy times | Planned (Phase 7 C review) |

## Integrity

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | OAuth flows resist CSRF and code interception | signed OAuth state (HMAC, `secureCompare`, nonce, cookie match); PKCE on social sign-in | `utils/oauth/state.ts`, `utils/oauth/callback-validation.ts`, `utils/auth.ts` (`pkce: true`) | upstream tests in `utils/oauth/*.test.ts` | code read | Partial (tests not yet run under this matrix) |
| I2 | Rocchio feedback cannot be corrupted by zero vectors or duplicate feedback | guards in the service and a unique feedback key | `fastapi_core/app/algorithms/feedback.py`, `CategorizeFeedbackEvent` | `fastapi_core/tests/test_scenario5_rocchio.py` | pytest passes | Built |
| I3 | Append-only audit log of security events | none yet | n/a | none | n/a | Planned (Phase 7 B) |
| I4 | Backups are checked for tampering before restore | none yet | n/a | none | n/a | Planned (Phase 7 A) |
| I5 | Security headers | X-Frame-Options, nosniff, Referrer-Policy, HSTS, enforced CSP (`frame-ancestors 'none'`) | `next.config.ts` | none | code read; Permissions-Policy absent | Partial (Phase 10 H) |
| I6 | Dependencies have no known high or critical issues | `pnpm audit --prod` | `pnpm-lock.yaml` | audit run 2026-11-16 | 3 high (zod <4.6.6 memory exhaustion, prosemirror-view <1.42.3 paste XSS, source-map-js <1.2.2 DoS), 4 moderate, 1 low; Python not audited (pip-audit not installed) | **Failing** |

## Availability

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 3-2-1 backup, RPO 24 h | none yet; `pg_dump` is not installed on Windows (Docker image has pg_dump 16.15) | n/a | none | local Postgres 16.15; Supabase version unknown | Planned (Phase 7 A) |
| A2 | Restore tested, RTO 4 h | none yet | n/a | none | n/a | Planned (Phase 7 A) |
| A3 | Mail still opens when the NLP service is down | service status banner, neutral "Not yet analyzed" state, per-feature fallback | `components/CategoraizeStates.tsx`, `utils/categoraize/features.ts` | none automated | browser-checked in earlier phases | Partial (failure drill: Phase 7 F) |
| A4 | Rate limiting on new routes and the NLP service | only public booking links and email OTP are rate-limited | `utils/booking/public-rate-limit.ts`, `utils/auth/email-otp.ts` | upstream tests | code read | Planned (Phase 10 H) |

## Privacy and data rights (RA 10173)

| # | Claim | Control | Files | Test | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Terms and Privacy Notice accepted before any mailbox is read | none; consent rows exist but there is no first-login gate or notice page | `utils/categoraize/consent.ts` (versions `2026-11-draft`) | none | n/a | Planned (Phase 7 E) |
| P2 | External-LLM processing is opt-in and off by default | `CategorizeUserConsent.externalLlmEnabled`, `assertExternalLlmAllowed` gate on drafts, follow-ups and LLM fallbacks | `utils/categoraize/consent.ts`, `utils/categoraize/features.ts` | none specific | Attachment filing and assistant chat are **not** gated (filing: multi-account audit F-2; chat and Telegram: by decision) | Partial |
| P3 | Users can withdraw consent and see their choices | settings toggle adds a new consent row; no withdraw/review view | `ExternalAiSetting.tsx`, `utils/actions/categoraize-consent.ts` | none | n/a | Partial |
| P4 | Data export | none | n/a | none | n/a | Planned (Phase 10 G) |
| P5 | Erasure with token revocation (FR-2.4) | `deleteUser` removes rows; all 12 CategorAIze tables cascade from `EmailAccount`/`User` | `utils/user/delete.ts`, `prisma/schema.prisma` | upstream tests | no provider token revocation in the deletion path | Partial (Phase 10 G) |
| P6 | Shared models never train on real Gmail-derived data | tagger trained only on synthetic, Claude-written and LLM-generated data; Rocchio centroids stay per account | `fastapi_core/training/`, `fastapi_core/data/` | training data provenance in `fastapi_core/README.md` | no real mail in training sets | Partial (no automated provenance check) |

## Zero trust mapping (summary; full mapping in Phase 7 F)

| Principle | Current control | Gap |
| --- | --- | --- |
| Verify explicitly | session middleware per route; signed OAuth state; internal key on the NLP service | no ID-tampering tests; 42 upstream routes reviewed by helper only |
| Least privilege | `drive.file` default scope; NLP service gets no tokens | calendar write scopes; app DB role can bypass RLS |
| Assume breach | tokens encrypted at rest | email text in plaintext; no audit log; no tested backups; leaked DB password on GitHub |
