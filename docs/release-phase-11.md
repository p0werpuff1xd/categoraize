# Release plan: Phase 11 (encryption, PII masking, RLS) and the NLP dataset work to `main`

Status: **released 2026-11-19 (about 02:15-03:30 +08:00).** Record:

| Step | Result |
|---|---|
| 0.3 backup | `E:\backups\prod\supabase-prod-20261119-021402-pre-phase11.dump.age` (age-encrypted, 118 tables, verified) |
| 1 key | New key `p1` in `E:\categoraize\secrets\encryption-prod.env` (copy in `D:\categoraize-keys`); web revision `00024` |
| 2 migrations | 3 applied; 15 policies on 14 CategorAIze tables; the live app (`postgres`) unaffected |
| 3 deploy | `main` fast-forwarded to `0d72bfcb8`; Cloud Build deployed revision `00025` |
| 4 backfill | All CategorAIze text encrypted under `p1` (0 plaintext left); the app's client decrypts it |
| 5 smoke test | Site, health and logs clean. The consent gate now asks for Terms acceptance: **no consent exists in production yet, so new mail is not processed until the owner accepts it** |
| 6 role | Found that Supabase enables RLS on all 120 public tables, so the role saw no users. Added migration `20261119030000_categoraize_app_upstream_access` (full access for `categoraize_app` on non-CategorAIze tables, the access `postgres` had via BYPASSRLS), then switched `DATABASE_URL` (revision `00026`). Checked: no tenant, 0 CategorAIze rows; with a tenant, that user's rows; sign-in works; logs clean. Credentials in `supabase-prod.env` as `APP_DATABASE_URL` |

Rollback now: `DATABASE_URL` back to the owner URL from `supabase-prod.env`
(revision `00025` has it). Do not roll back to revision `00024` or earlier:
that code cannot read the encrypted rows.

The plan as written before the release follows.

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

### 0. Prepare (no production changes) — done 2026-11-19 except item 3

1. **Done.** `origin/main` merged into the branch (`c6e50588c`); the only
   conflict, `apps/web/vercel.json`, takes `main`'s version (no crons: Vercel
   is paused and Hobby rejects sub-daily crons).
2. **Done** on Node 24:
   - Type check: app code clean after `60c75551d` (tenant transactions were
     typed `unknown`, 40 errors). About 1,190 errors remain in upstream test
     files; the production image sets `SKIP_TYPE_CHECK=true`, so they do not
     block the build.
   - Vitest: 9,689 passed, 24 failed in 20 files. 18 of those files fail on a
     clean `main` too (upstream/Windows environment); the other failures were
     flaky and passed on rerun. No regression from this branch.
   - NLP pytest: 187 passed; `/health` from `main` merged in.
   - Production image: `docker/Dockerfile.prod` builds (exit 0, 4.24 GB;
     `next build` compiled and generated all 300 static pages). Built locally
     on Docker Desktop in about 35 minutes; Cloud Build caches layers.
   - `assistant-chat.server-action-boundary.test.ts` can exceed its 5 s
     timeout on a cold import; it passes on both branches with more time.
   - Local image builds must use `git -c core.autocrlf=false archive HEAD | docker build -f docker/Dockerfile.prod -`:
     a Windows checkout turns `scripts/*.sh` into CRLF and the build stops with
     "not found". Cloud Build checks out on Linux and is not affected.
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
