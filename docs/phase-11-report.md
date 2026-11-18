# Phase 11 report — Field encryption, PII masking, and row-level security

**Date:** 2026-11-18  
**Branch:** `feat/phase-11-encryption-masking-rls`  
**Commits:** `15e88f90f` (I), `245a65c0c` (J), `93c043d36` (K)

---

## What was built

### Phase 11 I — AES-256-GCM field-level encryption of stored email text

**Files:** `apps/web/utils/categoraize/field-encryption.ts`,
`apps/web/utils/categoraize/field-encryption-extension.ts`,
`apps/web/utils/prisma.ts`

The six email-text columns that CategorAIze stores
(`CategorizeClassification.{subject,snippet,bodyText,summary,actionDirective}`,
`CategorizeExtractedSpan.text`) are now encrypted at rest with AES-256-GCM.

**Key design:**

| Item | Detail |
|------|--------|
| Algorithm | AES-256-GCM (authenticated) |
| Key derivation | HKDF-SHA256: master key → per-column key; each column gets a distinct key |
| IV | 12 bytes, random per row |
| AAD | `{table}.{column}.{rowId}` — ties each ciphertext to exactly one cell |
| Ciphertext format | `e1:<keyId>:<iv>:<tag>:<ciphertext>` (base64url segments) |
| Version | `e1` prefix; rotation adds to `ENCRYPTION_PREVIOUS_KEYS` without re-encrypting old rows |
| Environment | `ENCRYPTION_MASTER_KEY` (base64, ≥ 32 bytes), `ENCRYPTION_KEY_ID` |
| Backfill | `scripts/categoraize-encrypt-fields.ts` runs as the row owner via `withUserContext` |

The Prisma Client extension intercepts `create`, `createMany`, `update`,
`upsert`, and computed result fields; `updateMany` over encrypted columns throws
immediately because resolving each row's id would require an additional query per
row. The extension is the second link in the chain:
`encryptedTokens → encryptedEmailFields → auditPrismaQueries → tenantContext`.

**Residual risk:** no automated test for the extension yet; backfill not run on
the production or local databases.

---

### Phase 11 J — PII masking for Philippine formats

**Files:** `fastapi_core/app/nlp/pii.py`, `apps/web/utils/categoraize/pii-masking.ts`,
`apps/web/utils/categoraize/pii-settings.ts`

Regex-based masker that replaces matches before any storage, NLP call, or LLM
summary.

| Pattern | Replacement | Examples |
|---------|-------------|---------|
| Philippine mobile (`09XX XXXX XXXX`, `+639XX…`) | `[PHONE]` | `09171234567`, `+639171234567` |
| SSS number (`XX-XXXXXXX-X`) | `[GOV_ID]` | `12-3456789-0` |
| GSIS UMID (12 digits) | `[GOV_ID]` | `123456789012` |
| PhilHealth number (12 digits) | `[GOV_ID]` | — |
| TIN (`XXX-XXX-XXX[-XXXX]`) | `[GOV_ID]` | `123-456-789` |
| Passport (`PH` + 7 alphanums) | `[GOV_ID]` | `PHA123456` |
| Card PAN (13–19 digits, Luhn) | `[CARD]` | `4111 1111 1111 1111` |

The NLP service applies masking on every `/api/v1/classify` call when the
request flag `mask_pii=true`. The web app masks subject + body in
`process-email.ts` before calling `classifyAndStoreEmail` and before any storage
write. Users can toggle masking in `CategorizeUserSettings`; when disabled, the
web app sends `mask_pii=false` to the service.

`fastapi_core/tests/test_pii.py` covers the regex patterns.

**Residual risk:** the web-layer masking has no automated test; the LLM summary
path applies masking but it is not covered by a test.

---

### Phase 11 K — Row-level security on all CategorAIze tables

**Files:** `apps/web/utils/categoraize/tenant.ts`,
`apps/web/prisma/migrations/20261117120000_categoraize_row_level_security/migration.sql`,
`scripts/db/create-app-role.ps1`, `scripts/db/test-rls.sql`

**Migration** (`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all
13 CategorAIze tables):

| Table group | Policy | Using / With check |
|-------------|--------|--------------------|
| 11 account-scoped tables | `emailAccountId` ownership | `emailAccountId IN (SELECT id FROM "EmailAccount" WHERE "userId" = categorize_current_user_id())` |
| `CategorizeUserConsent`, `CategorizeUserSettings` | `userId` ownership | `"userId" = categorize_current_user_id()` |
| `CategorizeAuditEvent` | append-only | `WITH CHECK true` (insert); read by `userId` |

A `SECURITY DEFINER` function `categorize_users_with_accepted_terms(p_terms,
p_privacy)` lets background jobs enumerate consented users without a tenant
context.

**Runtime context** (`tenant.ts`): `AsyncLocalStorage` holds the active user or
email-account id. The `tenantContext` Prisma extension wraps every CategorAIze
query in a transaction that calls
`set_config('app.current_user_id', <userId>, true)` before the first statement.
Nested calls share the open transaction. Callers use:

- `withUserContext(userId, fn)` — layouts, server actions
- `withAccountContext(emailAccountId, fn)` — email-processing paths
- `withTenantSql(fallback, fn)` / `withAccountSql(fallback, fn)` — raw-SQL paths

**Runtime role** (`scripts/db/create-app-role.ps1`): creates `categoraize_app`
(LOGIN, NOSUPERUSER, NOBYPASSRLS) with SELECT / INSERT / UPDATE / DELETE on all
app tables. Schema changes and `_prisma_migrations` are blocked. The password
is written only to `apps/web/.env`.

**End-to-end SQL test** (`scripts/db/test-rls.sql`): runs as `categoraize_app`;
verifies no-context returns empty, tenant A sees only its rows, cross-tenant read
and write are rejected, audit-log append is allowed and reads are partitioned,
schema changes are refused. Everything is rolled back.

**Residual risk:** the migration is committed but **not yet applied** to the
local database (Docker Desktop was not running at commit time). The
`test-rls.sql` script has not been executed against the local DB.

---

## Overhead estimate

No formal benchmark was run. Expected overhead at serving time:

| Component | Added overhead |
|-----------|---------------|
| AES-256-GCM encrypt/decrypt per field | < 0.5 ms per row (pure Node `crypto`) |
| HKDF key derivation (cached per key+column) | one-time per process start |
| Tenant context `set_config` transaction | one extra round-trip per CategorAIze query group; shared within a transaction block |
| PII masking regex | < 1 ms per email body |

The FastAPI service's existing benchmark shows < 10 ms classify latency at p95
on a local CPU. PII masking adds < 1 ms to that.

---

## Pending owner actions

1. **Apply the RLS migration locally:** start Docker Desktop, then run
   `npx prisma migrate deploy` from `apps/web/` and `scripts/db/create-app-role.ps1`.
2. **Run `test-rls.sql`:** `psql -U categoraize_app -d inboxzero -f scripts/db/test-rls.sql`
3. **Run the encryption backfill:** `npx ts-node scripts/categoraize-encrypt-fields.ts`
4. **Rotate the age key backup:** save `age1…` identity to external media.
5. **Write automated tests** for the web-layer PII masking and the
   field-encryption Prisma extension.
6. **Apply the RLS migration to Supabase** (production) once the local run passes.

---

## Privacy notice update

The following items in Privacy Notice §6 may be changed from "planned" to "built
(pending production deployment)":

- Email text encryption at rest (FR-2.2)
- PII masking before NLP and storage (FR-2.1)
- Row-level tenant isolation at the database (FR-2.3)
