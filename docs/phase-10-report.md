# Phase 10 report: data rights and hardening

Branch `feat/phase-10-data-rights` (from `feat/phase-7-ias-foundation` after
the consent label fix `f8e1c2449`), 2026-11-17, **not pushed**.

| Commit | Part |
| --- | --- |
| `cb25a6848` | G. Data export, Google token revocation on deletion, re-applied erasures after a restore |
| `37c78ba2e` | H. NLP service: size and rate limits, counted auth failures, no CORS, no content in logs |
| `3b3ca1a95` | H. Permissions-Policy, patched npm dependencies, revocation never blocks deletion |
| `82229fa6b` | H. Secrets and dependency routine, gitleaks rule for database URLs, audit review scripts, control matrix |

## Before Phase 10: Phase 7 browser check

- The consent flow works end to end in the browser: Settings > Privacy shows
  the consent; Withdraw (with a confirmation that states the consequences)
  marks all rows withdrawn and sends you to `/consent`; any app URL then
  redirects there; Terms and Privacy pages render; accepting creates a new
  row and returns to the app; the Security log lists both events.
- Found and fixed: the consent checkbox's accessible name read "accept the
  and the" (`f8e1c2449`).
- Found: the dev server had been started before the audit-log migration, so
  its Prisma client did not know the new table and every audit write failed
  silently (by design, `recordAuditEvent` never throws). A consent row created
  at 23:36 on 2026-11-16 (external AI **on**) therefore has no audit event.
  Restarting the dev server fixed it. Lesson for deployments: restart the app
  after every migration, and check the Security log once.

## G. Data rights

- **Download my data** (Settings > Privacy): JSON with labels, analysis
  results without `bodyText`/`snippet`, spans, contacts, corrections, consent
  history and the security log; no tokens or secrets; 3 per hour per user
  (429 with `Retry-After`); each download logged.
  Checked in the browser: 13 sections, 45 classifications, no body or token
  fields; the fourth request in an hour was refused.
- **Delete account** now revokes Google tokens (sign-in, calendar, Drive)
  first, best effort. Microsoft personal accounts have no revocation
  endpoint: their tokens are deleted with the rows and expire on their own;
  users can remove the app at account.live.com/consent/Manage. Revocation
  counts go into the `data_deletion_completed` event. A failed lookup never
  blocks the deletion (bug found by the existing `deleteAccountAction` test and
  fixed).
- **Re-applying erasures after a restore**: `scripts/backup/reapply-deletions.ps1`
  takes the user IDs from the old database's audit log (or a list), refuses
  the live container, deletes the users in the restored copy and fails if any
  row is left. Drill: a fake user cloned into a restored scratch copy was
  fully removed; the other user's 45 classifications were untouched. Runbook
  step 7 now uses the script.

## H. Hardening

- **NLP service** (`fastapi_core/app/security.py`): constant-time key check
  (already in place), 413 over 4 MB, 411 without Content-Length, per-client
  rate limit (default 1200/min, `/healthz` exempt), failed key checks counted
  on `/healthz` and logged without the key, no CORS, no request text in logs.
  The restarted local service passes all 5 demo scenarios, and the web app's
  search still works through it.
- **Web**: Permissions-Policy added; CSP was already enforced (left as is;
  it still allows `'unsafe-inline' 'unsafe-eval'`).
- **Dependencies**: prosemirror-view 1.42.3, source-map-js 1.2.2, zod 4.6.6
  via overrides. `pnpm audit --prod`: 0 high (was 3), 4 moderate, 1 low.
  Python venv: pip 26.3, setuptools 84.2.1; only pytest 8.4.2 remains.
- **Secrets**: gitleaks gets a rule for database URLs (the defaults missed
  the Supabase leak); the 12 reviewed historical findings are in
  `.gitleaksignore` with reasons; full-history scan: no leaks. Routine,
  rotation table and cookie/OAuth report in
  `docs/ias/secrets-and-dependencies.md`.
- **Audit review** (missing from Phase 7): `scripts/audit/review.ps1` and
  `export.ps1`; both ran clean.

## Checks

| Check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` (apps/web) | 1,186 errors = baseline; none in changed files |
| New web tests (`revoke-tokens`, `data-export`) | 8 passed |
| Broad web run (154 files) | 1,288/1,292; the 4 failures passed on rerun (3 known load timeouts, 1 fixed here) |
| `fastapi_core` pytest | 94 passed (7 new) |
| `pnpm audit --prod` | 0 high/critical |
| gitleaks, full history | no leaks found |
| Demo (`scripts/categoraize/demo.ps1`) against the hardened service | 5/5 |

## Not verified

- A real Google token revocation (mocked in tests only); deleting a real
  account was not tried.
- The audit review's alert paths with real alerts (writing fake events
  into the append-only log would stay forever).
- Production: Phase 7 and 10 are not deployed; production Supabase does not
  have the audit-log migration yet.

## Open decisions for you

1. The consent row from 23:36 on 2026-11-16 has external AI **on**. If that
   was not you, turn it off in Settings.
2. Whether to shorten sessions (30 days now) for the demo period.
3. The 4 moderate npm advisories (uuid, @hono/node-server, glob, minimatch)
   and the pytest 9 upgrade can wait for the monthly routine, or be done now.
4. From Phase 7, still open: back up the age key, point the backup copies at
   the external drive and the cloud folder and register the daily task, and
   the OAuth scope decisions.
