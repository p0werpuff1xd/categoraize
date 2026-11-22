# Release plan: Phase 11 (encryption, PII masking, RLS) and the NLP dataset work to `main`

Status: **planned, not started.** Every production step below needs the owner
at the keyboard. Facts checked read-only on 2026-11-19.

## What ships

- Branch `feat/phase-11-encryption-masking-rls` is 39 commits ahead of `main`
  (Phase 11 I/J/K, PR #1 dataset work, the register-on-rules change, backup and
  encryption-script fixes, OAuth scope trim).
- `main` has 6 commits the branch lacks (Vercel packaging fixes, `/health` for
  Cloud Run, a docs password placeholder). They must be merged into the branch
  first; conflicts are expected only in deploy config.
- A push to `main` makes Cloud Build (`cloudbuild.yaml`) build and deploy the
  web service `categoraize` (asia-southeast3). The NLP service is already on
  the new code (revision `categoraize-nlp-00004`).

## Production facts that shape the order

| Fact | Consequence |
|---|---|
| The web service has no `ENCRYPTION_MASTER_KEY` / `ENCRYPTION_KEY_ID` | The new code refuses to read or write encrypted fields without them: set them **before** the deploy |
| The old code (`main`) cannot read ciphertext; the new code refuses plaintext | Run the encryption backfill **right after** the new revision serves. Production has 38 classifications and 410 spans, so the gap is seconds |
| Production lacks 3 migrations: `20261116120000_categoraize_audit_log`, `20261117090000_categoraize_pii_masking`, `20261117120000_categoraize_row_level_security` | All additive (new tables, a column, functions, policies). Safe to apply before the deploy |
| The app connects as Supabase `postgres`, which has `BYPASSRLS` | Applying the RLS migration does not change what the live app sees, and it also **protects nothing** until `DATABASE_URL` uses the `categoraize_app` role (step 6) |
| RLS is already enabled on the 12 CategorAIze tables with no policies | Supabase's API roles (`anon`, `authenticated`) already see nothing; the migration adds the tenant policies |

## Steps

Run from `E:\categoraize\categoraize` unless noted. Never print secret values.

### 0. Prepare (no production changes)

1. Merge `origin/main` into `feat/phase-11-encryption-masking-rls`; resolve
   conflicts; push the branch.
2. On Node 24 (`fnm exec --using=24`): in `apps/web` run the type check, the
   full Vitest suite and `next build`; in `fastapi_core` run pytest (187).
3. Back up production: Supabase dashboard → Database → Backups, note the
   latest daily backup time, or take a `pg_dump` with the owner URL from
   `E:\categoraize\secrets\supabase-prod.env` into an age-encrypted file.

### 1. Production encryption key (before anything else)

1. Generate a new 32-byte key for production (do not reuse the local `k1`):
   key id `p1`. Store it as `ENCRYPTION_MASTER_KEY` and `ENCRYPTION_KEY_ID=p1`
   in `E:\categoraize\secrets\encryption-prod.env` and back that file up with
   the age key.
2. Add both to the web service by merging into the full env list with
   `--env-vars-file` (`gcloud --update-env-vars` mangles commas). The running
   old revision ignores them.

### 2. Migrations

1. `npx prisma migrate deploy` in `apps/web` with `DATABASE_URL` set to the
   owner URL from `supabase-prod.env` (session pooler or direct, not the
   transaction pooler).
2. Check: the three migrations are in `_prisma_migrations`; the live site
   still loads and shows CategorAIze data (it should: `postgres` bypasses RLS).

### 3. Deploy the code

1. Open a PR `feat/phase-11-encryption-masking-rls` → `main`, wait for checks,
   merge. Cloud Build deploys a new `categoraize` revision.
2. Watch the build; note the new revision name.

### 4. Encrypt existing rows (immediately after step 3 serves)

From `apps/web`, with `DIRECT_URL` (owner) and the step 1 key in the
environment:

```
node --env-file=<prod env file> --import tsx scripts/categoraize-encrypt-fields.ts --backfill --dry-run
node --env-file=<prod env file> --import tsx scripts/categoraize-encrypt-fields.ts --backfill
```

Check: the dry run counts 38 + 410 rows' worth of values; the real run
records an `encryption_key_rotated` audit event; the inbox shows readable
CategorAIze summaries and spans.

### 5. Smoke test the web app

Sign in, open the CategorAIze inbox, classify one new email, check the
Smart Task Sheet and the priority panel. Check Cloud Run logs for
`FieldEncryptionError` or Prisma errors.

### 6. Turn RLS on for the app (separate, after step 5 is clean)

1. Create the role by hand in the Supabase SQL editor (the SQL inside
   `scripts/db/create-app-role.ps1`, with a password from a password manager,
   saved to `E:\categoraize\secrets\supabase-prod.env` as a new
   `APP_DATABASE_URL`). Pooler user name: `categoraize_app.<project-ref>`.
2. Read-only check as the role: `SET ROLE categoraize_app;` then counting
   `CategorizeClassification` with no tenant set must return 0.
3. Point the web service's `DATABASE_URL` at the role (keep `DIRECT_URL` on
   the owner for migrations and maintenance). New revision.
4. Repeat the step 5 smoke test, including a background job (Gmail webhook or
   the scheduled-actions cron).

## Rollback

| Step | Rollback |
|---|---|
| 1 | Remove the two env vars (only matters if no new code is serving) |
| 2 | Leave the migrations: they are additive and inert for `postgres` |
| 3 | `gcloud run services update-traffic categoraize --to-revisions <previous>=100 --region asia-southeast3`. **Only before step 4**: the old code cannot read encrypted rows |
| 4 | Keep the new code. If a row is unreadable, re-run the script without `--backfill` (re-encrypt) or restore that table from the step 0 backup |
| 6 | Set `DATABASE_URL` back to the owner URL (new revision); RLS stays inert for `postgres` |

## Not part of this release

- Wiring the web app to `/priority`, `/register`, `/tasks` and `/discover`
  (needs decisions on how learned priority combines with each user's
  per-category base priority, a register column, and the suggested-categories
  screen).
- External or off-site backup copies and a USB copy of the age key.
- Second-labeler and native-speaker reviews of the dataset.
