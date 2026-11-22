# Phase 7 report: IAS foundation

Branch `feat/phase-7-ias-foundation`, run 2026-11-16/17 (automated, the owner
was away). Five commits on top of `1ca796592`, **not pushed**:

| Commit | Part |
| --- | --- |
| `32b3d0bcf` | B. Append-only security audit log |
| `6c108c7d4` | E. Terms and Privacy Notice consent gate (FR-1.8) |
| `d18f980d4` | D. Tenant isolation tests |
| `b8ff6bed4` | A. Encrypted, redacted backups with a tested restore |
| `95ac987e2` | C + F. Scope review, incident response, BCP, zero trust, control matrix |

This report is the sixth commit. Control status per claim is in
`docs/ias/control-matrix.md`.

## 1. What changed

Paths relative to `apps/web/` unless they start with `scripts/` or `docs/`.

**B. Audit log** (`32b3d0bcf`)
- `prisma/schema.prisma` (model `CategorizeAuditEvent`),
  `prisma/migrations/20261116120000_categoraize_audit_log/migration.sql`
  (append-only trigger; already applied to the local DB, never to Supabase).
- `utils/categoraize/audit.ts` + `audit.test.ts` (new tests).
- Hooks: `utils/auth.ts` (login, account connected), `utils/user.ts` +
  `utils/actions/categoraize-audit.ts` (logout), `utils/actions/user.ts`
  (account disconnect, data deletion), `utils/actions/calendar.ts`,
  `utils/actions/drive.ts`, `utils/auth/cleanup-invalid-tokens.ts`
  (disconnects), `utils/calendar/oauth-callback-helpers.ts`,
  `utils/drive/handle-drive-callback.ts` (scope changes),
  `utils/categoraize/client.ts` (NLP 401s).
- Security log: `app/(app)/[emailAccountId]/categoraize/security/`,
  `app/api/user/audit-events/route.ts`, `hooks/useCategoraize.ts`.
- Fix during verification: `noUselessUndefined` lint in `audit.ts`.

**E. Consent** (`6c108c7d4`)
- `utils/categoraize/consent.ts`, `consent-paths.ts`, `consent.test.ts` (new
  tests), `utils/actions/categoraize-consent.ts` (+ `.validation.ts`),
  `app/api/user/categoraize-consent/route.ts`.
- Gates: `app/(app)/layout.tsx`, `utils/email/watch-manager.ts`,
  `utils/webhook/validate-webhook-account.ts`.
- Pages: `app/(landing)/consent/`, `terms/`, `privacy/`, `LegalDraftPage.tsx`,
  login links in `app/(landing)/login/page.tsx`.
- Settings: `ConsentSetting.tsx` in `SettingsTab.tsx`.
- Fixes during verification: the one new TypeScript error
  (`ConsentSetting.tsx:36`, `describe()` typed with `Pick<...>`); biome
  formatting of the consent, terms and privacy pages and the consent action.

**D. Isolation** (`d18f980d4`)
- `app/api/categorai/isolation.test.ts` and
  `utils/actions/categoraize-isolation.test.ts`. No app code changed: the
  existing middleware already enforces ownership and every CategorAIze row
  lookup is filtered by the verified `emailAccountId`, so no central helper
  was needed.

**A. Backups** (`b8ff6bed4`)
- `scripts/backup/common.ps1`, `backup.ps1`, `restore-test.ps1`.
- `docs/backup-report.md` (written by the restore test),
  `docs/recovery-runbook.md` (includes the Task Scheduler command, **not
  registered**), `docs/ias/key-management.md`.
- Outside the repo (not committed): age v1.3.2 in `E:\tools\age` (SHA-256
  checked against GitHub's published digest), key pair in
  `E:\keys\categoraize-backup\` (folder ACL: your user and SYSTEM),
  backup sets in `E:\backups\copy1` and `E:\backups\copy2`, logs in
  `E:\backups\logs`.

**C + F. Docs** (`95ac987e2`)
- `docs/oauth-scope-review.md`, `docs/ias/incident-response.md`,
  `docs/ias/bcp.md`, `docs/ias/zero-trust-mapping.md`,
  `docs/ias/control-matrix.md`.
- Privacy Notice (`app/(landing)/privacy/page.tsx`): section 6 now lists the
  encrypted, tested backups and keeps "running them daily on separate drives"
  as planned; section 4 says backups include account details.

## 2. What works (with commands and results)

Run from `apps/web` after `. E:\categoraize\dev-env.ps1`.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `$env:NODE_OPTIONS='--max-old-space-size=6144'; pnpm exec tsc --noEmit` | 1,186 errors = the baseline; **none in Phase 7 files**. The only non-test error is the pre-existing `utils/__mocks__/email-provider.ts:178`. |
| Lint/format | `pnpm exec biome check <changed files>` | clean (files with CRLF from checkout are clean once normalized to LF, which git does on commit) |
| Audit + consent unit tests | `pnpm test -- --run utils/categoraize/audit utils/categoraize/consent` | 7 + 8 pass |
| Task suites | `pnpm test -- --run utils/categoraize utils/webhook utils/email/watch-manager` | 20 files, 232 tests pass |
| Isolation | `pnpm test -- --run app/api/categorai/isolation utils/actions/categoraize-isolation` | 48 tests pass (21 route, 27 action) |
| Wider regression | `pnpm test -- --run utils/categoraize utils/webhook utils/email/watch-manager utils/actions utils/auth utils/user utils/calendar utils/drive app/api/user app/api/categorai utils/middleware` | 152 files, 1,282/1,285 pass. The 3 failures (`utils/auth-login-providers.test.ts`, `utils/actions/assistant-chat.server-action-boundary.test.ts`) took 5 to 11 s and **pass when run alone**: timeouts under load, not Phase 7 regressions (the same files passed in an earlier 129-file run). |
| Backup | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\backup.ps1` (from the repo root) | 3 runs PASS, 127 to 147 s; 19 tables with rows, 18 columns redacted and re-checked |
| Restore test | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\restore-test.ps1` | PASS: 19/19 row counts match, redaction empty, audit log append-only on the restored copy, tamper copy refused by checksum and by age; data restore 113 to 115 s (`docs/backup-report.md`) |
| Retention | synthetic test: 60 daily sets + one same-day extra | kept 7 daily (+ the same-day extra) and the weekly sets of Nov 1 and Nov 8; 51 older sets removed and logged |

## 3. Not verified

- **Consent flow in a browser**: redirect to `/consent`, accepting, the
  Settings > Privacy card, withdrawing, the Security log page. Only unit and
  route tests cover them.
- **Live Outlook / Gmail**: no real-mailbox run; watch-manager and webhook
  consent gates are covered by unit tests only.
- **Audit hooks one by one**: the helper and the append-only trigger are
  tested; each call site (login, logout, disconnect, ...) is not.
- **Full-service RTO**: only the data restore is timed; secrets, app start and
  reconnecting mailboxes were not drilled.
- **3-2-1 in practice**: both copies are on `E:` and the daily task is not
  registered, so RPO 24 h is not met yet.
- Python tests (`fastapi_core`) were not rerun: nothing there changed.

## 4. Things done along the way that you should know

- `tsc` crashed out of memory twice (exit 134 while vitest ran in parallel,
  and once 0xC0000409); rerunning it alone succeeded. **The dev server (3000)
  and NLP service (8000) were not stopped.**
- The scripts wrote real rows to the **local** audit log while being built:
  `backup_run` 3 PASS + 1 FAIL (a script bug, fixed), `restore_test` 2 PASS + 1
  FAIL (Windows reserves port 55433; the scratch port is now 15433 and the
  script checks it first). The log is append-only, so these stay.
- The first backup set (`categoraize-20261116-234931`) has a 3.9 MB manifest
  (a serialization bug, fixed); the data in it is fine. All three sets are
  kept (read-only) in both copy folders.
- The age key generation was interrupted once and left an empty file, which I
  deleted and regenerated (both were mine).
- The first commit's message briefly had a UTF-8 BOM; I amended that unpushed
  commit at once. All messages are in `E:\tmp\msgs`.
- `git status` still shows ` M` on several committed files: these are
  line-ending-only differences (`git diff` is empty), together with the 8 files
  you listed. `.claude/launch.json` and `fastapi_core/models/tagger/v7/` remain
  untracked and unstaged.

## 5. Open decisions for you

1. **Back up the age private key** (`E:\keys\categoraize-backup\age-identity.txt`)
   to a password manager or a separate USB key now. Without it every backup is
   unreadable (`docs/ias/key-management.md`).
2. **Point the copies at real media and register the task**: Copy 1 on the
   external drive, Copy 2 in the off-site cloud folder; run the
   `Register-ScheduledTask` block in `docs/recovery-runbook.md` section B.
3. **Reset the Supabase password** (control C10a, still failing).
4. **Scopes** (`docs/oauth-scope-review.md`): which upstream features stay
   (Gmail filters/signatures, contacts, sending, calendar event creation,
   Drive filing, full Drive); and drop the redundant pairs (Microsoft
   `Calendars.Read` + `Calendars.ReadWrite`, Google `calendar.freebusy` +
   `calendar.readonly`).
5. **`fastapi_core/models/tagger/v7/`** is untracked and not in any backup:
   commit it, store it with the backups, or accept retraining after a loss.
6. **Legal text**: Terms and Privacy Notice are drafts (`2026-11-16-draft`);
   bumping the version re-asks every user.
7. **Backup scope**: backups hold rows of the CategorAIze tables and User,
   EmailAccount, Account, Premium, Category (needed by their foreign keys),
   without email text, tokens or secrets. Embedding vectors and sender
   addresses are kept. Say if any of that should also be left out.
8. Whether production (Supabase) needs its own backup plan; these scripts only
   accept the local Docker database by design.

## Summary

Phase 7 is in: an append-only audit log, the consent gate, tenant isolation
tests, encrypted and redacted backups with a passing restore and tamper test,
and the scope, incident response, BCP and zero trust documents, in six local
commits with typecheck at baseline and all Phase 7 tests passing. Still open:
a browser check of the consent flow, registering the daily backup on separate
drives, backing up the age key, and the scope and Supabase decisions listed
above.
