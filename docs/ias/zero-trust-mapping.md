# Zero trust mapping

Phase 7 F, 2026-11-17. Maps the NIST SP 800-207 zero trust tenets to the
controls that exist in this repository, with the evidence that they work and
the gaps. Control IDs refer to `docs/ias/control-matrix.md`. Paths are relative
to `apps/web/` unless they start with `fastapi_core/`, `scripts/` or `docs/`.

| Tenet (SP 800-207) | Control in CategorAIze | Evidence | Gap |
| --- | --- | --- | --- |
| 1. All data sources and services are resources | Web app, NLP service, Postgres, Redis and each mailbox/calendar/Drive connection are treated as separate resources with their own credentials | `X-Internal-Key` on the NLP service (C9); separate OAuth connections for mail, calendar, Drive | Postgres role `postgres` is superuser and bypasses RLS (C4) |
| 2. All communication is secured regardless of network location | OAuth with signed state and PKCE (I1); NLP calls carry an internal key even on localhost | `utils/oauth/state.ts`; `fastapi_core/tests/test_api_guards.py` | Local services talk over plain HTTP on loopback; TLS only in deployment |
| 3. Access is granted per session | Every API route resolves the session and the email account per request (`withEmailAccount`, `withAuth`); every server action re-checks ownership (`actionClient`) | `app/api/categorai/isolation.test.ts`, `utils/actions/categoraize-isolation.test.ts` (Phase 7 D): another user's account gets 403/Unauthorized, other accounts' row IDs are refused | No per-request device or risk signals |
| 4. Access is decided by dynamic policy | Consent gate: no mailbox processing without current Terms/Privacy acceptance (P1); external LLM only with opt-in (P2); withdrawal stops processing at once | `utils/categoraize/consent.test.ts`; `utils/email/watch-manager.ts`, `utils/webhook/validate-webhook-account.ts` | Gate redirect not browser-verified yet |
| 5. Monitor integrity and security posture of assets | Append-only audit log (I3); dependency audits (I6); backup tamper checks (I4) | `utils/categoraize/audit.test.ts`; append-only check and tamper test in `scripts/backup/restore-test.ps1` (`docs/backup-report.md`) | 3 high npm advisories open (I6); no alerting on audit events |
| 6. Authentication and authorization are dynamic and strictly enforced | Short-lived sessions (Better Auth), token refresh, invalid tokens cleaned up and logged (`account_disconnected`) | `utils/auth/cleanup-invalid-tokens.ts`; `utils/auth.test.ts` (upstream) | No MFA requirement beyond the identity provider's |
| 7. Collect information to improve security posture | Security log visible to each user; `nlp_auth_failure_count`, `oauth_scope_changed`, `backup_run`, `restore_test` events | Security log page `/[emailAccountId]/categoraize/security` | No central review or threshold alerts |

## By principle (summary used in the IAS document)

| Principle | Now | Next |
| --- | --- | --- |
| Verify explicitly | session + account ownership on every route and action, with ID-tampering tests; signed OAuth state; NLP internal key | row-level security as a second layer (Phase 11 K) |
| Least privilege | `drive.file` by default; NLP service gets no tokens; scope review done (`docs/oauth-scope-review.md`); backups never hold tokens or email text | remove the redundant and upstream-only scopes the owner decides on; non-superuser DB role |
| Assume breach | tokens encrypted at rest; append-only audit log; encrypted, redacted backups with tamper checks and a tested restore; incident response plan | encrypt stored email text (C2); move secrets off the data disk; register the daily backup; reset the leaked Supabase password (C10a) |
