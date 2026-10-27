# Categoraize Phase 1 Deployment Specification

Status: Proposed

This specification defines the first deployment milestone for the Categoraize fork. The goal is to make the existing application usable in a Vercel preview deployment, backed by Supabase PostgreSQL, with a real Google sign-up smoke test. Model development and the future FastAPI service begin only after this milestone passes.

## Objective

Deploy the current forked configuration so that a dedicated test user can:

1. Open the Vercel deployment.
2. Sign up and sign in with Google.
3. Reach the authenticated application.
4. Refresh the page without losing the session.
5. Sign out and sign back in.

The first milestone does not require mailbox synchronization, AI classification, embeddings, or a production model service.

## Target architecture

```text
Browser
  |
  v
Vercel - Next.js application and existing Better Auth Google provider
  |
  v
Supabase PostgreSQL - Prisma data, pgvector extension, migrations

Google OAuth ---------------> Existing application auth callback

Future phase: FastAPI model service and model workers
```

### Decisions

- Vercel hosts the Next.js application in `apps/web`.
- Supabase provides PostgreSQL and `pgvector` for the application database.
- The existing application authentication remains the source of truth for Google OAuth. Supabase Auth is not introduced in this phase.
- Prisma remains the database access layer. The Vercel build does not run database migrations; migrations are applied as a controlled release step.
- FastAPI, model endpoints, embeddings, and classification are explicitly deferred until deployment and authentication are proven.

This keeps the first release aligned with the current codebase instead of introducing two authentication systems or a model runtime before the base application is deployable.

## Vercel project configuration

Configure the Vercel project as follows:

- Repository: the Categoraize repository.
- Production branch: `main`.
- Root directory: `apps/web`.
- Framework: Next.js.
- Node.js: the version required by the repository's package metadata.
- Build command: use the checked-in `apps/web/vercel.json` configuration. It delegates to `scripts/vercel-build.sh` from the repository root.
- Install command: use the repository's existing pnpm configuration; do not replace it with an app-local npm install.

The current build wrapper intentionally limits Turbo concurrency and skips the Next.js type-check worker during the Vercel build to avoid the previously observed builder out-of-memory failure. Type checking remains a separate validation concern. Do not replace the wrapper with the old long inline Vercel command; Vercel rejects build commands over 256 characters.

Use separate Preview and Production environment values. Preview should use a separate Supabase project or database whenever possible so test sign-ups and migrations cannot affect production data.

## Supabase setup

1. Create a Supabase project for the deployment environment.
2. Enable the PostgreSQL `vector` extension before applying migrations. Confirm that the extension is available in the database used by Prisma.
3. Copy the Supabase pooled connection string and the direct/unpooled connection string.
4. Apply the repository Prisma migrations from a controlled environment with the target database variables set:

   ```text
   pnpm --filter inbox-zero-ai exec prisma migrate deploy
   ```

5. Confirm that the migration containing vector columns and HNSW indexes succeeds.

The application should use the pooled connection for normal web requests and the direct connection for Prisma migration/direct operations. The repository supports both the explicit `DATABASE_URL`/`DIRECT_URL` names and the Vercel/Postgres-compatible `POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING` names. Set the explicit variables unless the chosen Vercel integration reliably supplies the compatible names.

Supabase is the database provider in this phase, not the authentication provider. Do not add Supabase Auth callbacks or a second session system to satisfy this deployment milestone.

## Required Vercel environment variables

Configure these independently for Preview and Production. Values are secrets unless marked public.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_BASE_URL` | Canonical URL for the environment. |
| `DATABASE_URL` | Supabase pooled PostgreSQL connection string. |
| `DIRECT_URL` | Supabase direct/unpooled PostgreSQL connection string. |
| `AUTH_SECRET` | Better Auth session/signing secret. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. |
| `EMAIL_ENCRYPT_SECRET` | Existing encrypted email data secret required by the app configuration. |
| `EMAIL_ENCRYPT_SALT` | Existing encrypted email data salt required by the app configuration. |
| `GOOGLE_PUBSUB_TOPIC_NAME` | Required Google integration configuration. Use the real topic when mailbox sync is enabled; for this auth-only smoke test it must still be a non-empty environment value accepted by the app. |
| `INTERNAL_API_KEY` | Internal service/API protection key. |
| `DEFAULT_LLMS` | Required application configuration. Keep it valid for the configured provider even though model behavior is not part of this milestone. |
| `LLM_API_KEY` | Provider key required if the configured model path is initialized. |

If the deployment uses the compatibility names supplied by a Vercel integration, also verify the resulting values for `POSTGRES_PRISMA_URL` and `POSTGRES_URL_NON_POOLING`. Do not commit any of these values. Keep `.env.example`, `env.ts`, and `turbo.json` aligned when adding future variables.

The build wrapper sets `SKIP_TYPE_CHECK=true` for the Vercel build. It should not be used as a substitute for application validation or silently copied into unrelated environments.

## Google OAuth configuration

Use a dedicated Google test account and keep the OAuth app in testing mode until the flow is verified.

For each stable deployment hostname, configure:

- Authorized JavaScript origin: `https://<deployment-hostname>`.
- Authorized redirect URI: `https://<deployment-hostname>/api/auth/callback/google`.

Add the localhost callback separately when testing locally:

```text
http://localhost:3000/api/auth/callback/google
```

For preview deployments, prefer a stable preview hostname that can be registered in Google Cloud. If each preview receives a changing URL, register the specific test URL needed for the smoke test rather than broadening OAuth origins unnecessarily.

The Google consent screen should identify the application as Categoraize and include the dedicated test account as an allowed test user.

## Release sequence

1. Confirm the deployment branch contains the current Vercel build wrapper.
2. Create the Preview Supabase project and enable `pgvector`.
3. Add Preview Vercel environment variables.
4. Deploy a Preview build from `main`.
5. Apply Prisma migrations to the Preview database.
6. Configure the Google OAuth origin and callback for the Preview hostname.
7. Redeploy after any environment or OAuth configuration changes.
8. Run the sign-up smoke test below.
9. Repeat the setup with separate Production values only after Preview passes.

Database migrations should be applied before testing authenticated application behavior. A successful JavaScript build alone does not prove that the database is usable.

## Acceptance criteria

### Build and hosting

- Vercel completes the build without the `buildCommand` schema error.
- Vercel completes the build without the previous type-check worker out-of-memory failure.
- The deployed URL loads the application shell over HTTPS.
- No database secret or OAuth secret is present in the repository or browser-exposed variables.

### Database

- Prisma migrations report success against the target Supabase database.
- Required application tables exist.
- The `vector` extension is enabled and the vector migration succeeds.
- Preview and Production data are isolated.

### Google sign-up simulation

- A dedicated test Google account can complete the OAuth consent flow.
- The callback returns to the deployed application without a redirect or state error.
- A user/session is created by the existing application auth system.
- The authenticated user can reach the app, refresh, sign out, and sign back in.
- No temporary authentication bypass or hard-coded user is used.

### Scope boundary

- No FastAPI service is required for this milestone.
- No model inference, embeddings, classification quality, or background mailbox sync is required for this milestone.
- Supabase Auth, Supabase Storage, billing, and production-scale OAuth review are deferred unless separately specified.

## Risks and rollback

- If a migration fails, stop the release, inspect the Supabase migration error, and do not partially change the production database manually. Fix the migration or use a disposable Preview database first.
- If a deployment fails after a successful prior deployment, use Vercel's deployment rollback while the configuration is corrected.
- If OAuth fails, verify the exact hostname, callback path, client ID, and Google test-user configuration before changing application code.
- Keep a database backup or Supabase recovery point before applying the first Production migration.

## Phase 2 entry gate

Phase 2 may begin only after all Preview acceptance criteria pass. The next specification should then define the FastAPI model service, its hosting target, authentication between Vercel and FastAPI, model/version configuration, timeouts, observability, and failure behavior. That service should be added incrementally after the deployable fork is demonstrated, not as a prerequisite for the first Google sign-up deployment.
