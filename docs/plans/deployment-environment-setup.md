# Categoraize Deployment Environment Setup

This guide explains the environment variables required for the first deployment milestone:

- Next.js application hosted on Vercel
- Supabase PostgreSQL database with `pgvector`
- Existing application authentication with Google OAuth
- Signup and session smoke testing with a dedicated Google test account

FastAPI, model inference, mailbox synchronization, and Supabase Auth are not required for the first signup test.

## 1. Where variables are entered

Open the Vercel project and go to:

```text
Project → Settings → Environment Variables → Add New
```

Create each variable separately. For the first deployment, select **Preview**. After Preview succeeds, add the production values separately under **Production**.

Never commit real values to Git, `.env.example`, screenshots, or chat messages. Vercel environment variables are encrypted and are only applied to new deployments after they are changed.

## 2. Required variable checklist

These are the variables needed for the first Vercel deployment. The names are case-sensitive.

```text
NEXT_PUBLIC_BASE_URL
DATABASE_URL
DIRECT_URL
AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
EMAIL_ENCRYPT_SECRET
EMAIL_ENCRYPT_SALT
INTERNAL_API_KEY
GOOGLE_PUBSUB_TOPIC_NAME
DEFAULT_LLMS
LLM_API_KEY
```

The application also supports the legacy `NEXTAUTH_SECRET` name, but use `AUTH_SECRET` for this deployment.

## 3. `NEXT_PUBLIC_BASE_URL`

### Value

The public HTTPS URL for the environment.

Preview example:

```text
https://categoraize-git-deployonline-powerpuff-girls4.vercel.app
```

Production example:

```text
https://categoraize.com
```

### Where to find it

Open the Vercel deployment and copy its domain from the **Domains** section. Do not add a trailing slash.

### Environment selection

- Preview: use the stable preview domain used for OAuth testing.
- Production: use the final production domain.

The checked-in Vercel build wrapper also supplies the current Vercel preview URL during preview builds. Keep this variable set anyway because the application requires it at runtime and uses it for links, OAuth, metadata, and security checks.

## 4. Supabase database variables

Supabase supplies both database values. These are database connection strings, not Supabase API keys.

### Create the Supabase project

1. Open [Supabase](https://supabase.com/dashboard).
2. Click **New project**.
3. Create a Preview project first, for example `categoraize-preview`.
4. Save the database password. You need it to complete the connection strings.
5. Create a separate Production project later, for example `categoraize-production`.

### Enable pgvector

Open the Supabase SQL Editor and run:

```sql
create extension if not exists vector;
```

The repository migration also enables the extension, but enabling it explicitly makes the deployment prerequisite visible before migrations run.

### `DATABASE_URL`

1. In Supabase, click **Connect** at the top of the project dashboard.
2. Choose **Session pooler**.
3. Copy the PostgreSQL connection string.
4. Replace the password placeholder with the Supabase database password.
5. Paste the result into Vercel as `DATABASE_URL`.

It should look similar to this, but use the exact host and username shown by Supabase:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres
```

The pooled connection is used for normal application requests because Vercel functions are short-lived and can create many concurrent connections.

### `DIRECT_URL`

1. Stay in the Supabase **Connect** dialog.
2. Choose **Direct connection**.
3. Copy the connection string.
4. Replace the password placeholder.
5. Paste it into Vercel as `DIRECT_URL`.

It should look similar to:

```text
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

This value is used for Prisma migration and direct database operations. Supabase notes that direct connections may require IPv6 support; if the environment cannot reach the direct endpoint, run migrations from a machine that can reach it or use the appropriate Supabase pooler mode.

### Optional Vercel-compatible names

Some database integrations provide these names automatically:

```text
POSTGRES_PRISMA_URL
POSTGRES_URL_NON_POOLING
```

The repository recognizes them as fallbacks. Do not create duplicate conflicting values. The simplest explicit setup is:

```text
DATABASE_URL=<Supabase session-pooler URL>
DIRECT_URL=<Supabase direct URL>
```

## 5. `AUTH_SECRET`

This is a private signing/encryption secret for application sessions.

Generate it locally in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output into Vercel as `AUTH_SECRET`. Generate a different value for Preview and Production. Do not use the example value from any documentation.

## 6. Google OAuth variables

These values come from Google Cloud, not Supabase.

### Create or select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project that will own the OAuth client and Gmail APIs, or create a new project.
3. Record the **Project ID**, not only the display name.
4. Open **APIs & Services → Library**.
5. Enable **Gmail API** and **Cloud Pub/Sub API**.

### `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

1. Open **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. If prompted, configure the OAuth consent screen.
4. Choose application type **Web application**.
5. Add the authorized JavaScript origin:

   ```text
   https://YOUR-VERCEL-DOMAIN.vercel.app
   ```

6. Add the authorized redirect URI:

   ```text
   https://YOUR-VERCEL-DOMAIN.vercel.app/api/auth/callback/google
   ```

7. For local testing, also add:

   ```text
   http://localhost:3000
   http://localhost:3000/api/auth/callback/google
   ```

8. Click **Create**.
9. Copy the client ID into `GOOGLE_CLIENT_ID`.
10. Copy the client secret into `GOOGLE_CLIENT_SECRET`.

The redirect URI must exactly match the deployed hostname, scheme, path, and trailing slash behavior. Use a dedicated Google test account while the consent screen is in testing mode.

### Google test user

In Google Cloud, open **Google Auth Platform → Audience** or the equivalent consent-screen configuration, then add the Google account that will perform the signup test as a test user.

## 7. `GOOGLE_PUBSUB_TOPIC_NAME`

This value is for Gmail mailbox change notifications. The application requires the variable to be non-empty even though the first milestone only tests signup.

### Create the topic

1. In Google Cloud Console, select the same project used for the OAuth client.
2. Open **Pub/Sub → Topics**.
3. Click **Create topic**.
4. Use a name such as:

   ```text
   categoraize-gmail
   ```

5. Copy the full topic name. It has this form:

   ```text
   projects/YOUR_PROJECT_ID/topics/categoraize-gmail
   ```

6. Put that full value into Vercel as `GOOGLE_PUBSUB_TOPIC_NAME`.

### Grant Gmail permission

On the topic's permissions page, grant **Pub/Sub Publisher** to:

```text
gmail-api-push@system.gserviceaccount.com
```

This permission is needed when the app later calls Gmail's watch API. Google documents that the topic must exist and Gmail must have publish permission before Gmail can send notifications.

## 8. Email encryption variables

These are application-generated secrets used to protect stored email credentials. They do not come from Supabase or Google.

Generate separate values:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the first output as `EMAIL_ENCRYPT_SECRET`.

Generate the salt:

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

Set the second output as `EMAIL_ENCRYPT_SALT`.

Use stable values per environment. Do not regenerate these after users or mailbox credentials have been stored, or previously encrypted data may become unreadable.

## 9. `INTERNAL_API_KEY`

This protects internal application/service requests. Generate it locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the output as `INTERNAL_API_KEY`. Use a different Preview value and Production value.

## 10. `DEFAULT_LLMS` and `LLM_API_KEY`

`DEFAULT_LLMS` is required by the application environment schema even though model work is deferred.

Choose one provider that is supported by the current `.env.example`. The format is:

```text
provider:model-name
```

Examples from the repository's configuration include provider/model pairs such as:

```text
openai:<provider-model-name>
anthropic:<provider-model-name>
google:<provider-model-name>
openrouter:<provider-model-name>
```

Use a model name currently available to the provider account; do not copy an obsolete example blindly.

`LLM_API_KEY` is the API key issued by that provider. If the selected provider uses a provider-specific variable instead, set that variable instead—for example `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, or `OPENROUTER_API_KEY`.

For the signup-only milestone:

- Keep the value valid so environment validation succeeds.
- Do not test or enable classification yet.
- Use the lowest-cost approved provider/model if the application initializes model configuration.

## 11. Variables not required for Phase 1

Do not add these unless a later feature needs them:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_WEBHOOK_CLIENT_STATE
SLACK_CLIENT_ID
SLACK_CLIENT_SECRET
STRIPE_SECRET_KEY
SENTRY_AUTH_TOKEN
```

Supabase is used as the PostgreSQL provider in Phase 1. Supabase Auth is not used, so Supabase Auth keys are intentionally absent.

## 12. Vercel entry checklist

For Preview, enter these values:

```text
NEXT_PUBLIC_BASE_URL=https://YOUR-PREVIEW-DOMAIN
DATABASE_URL=<Supabase session-pooler connection string>
DIRECT_URL=<Supabase direct connection string>
AUTH_SECRET=<generated secret>
GOOGLE_CLIENT_ID=<Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<Google OAuth client secret>
EMAIL_ENCRYPT_SECRET=<generated secret>
EMAIL_ENCRYPT_SALT=<generated salt>
INTERNAL_API_KEY=<generated secret>
GOOGLE_PUBSUB_TOPIC_NAME=projects/YOUR_PROJECT_ID/topics/categoraize-gmail
DEFAULT_LLMS=<provider:model>
LLM_API_KEY=<provider API key>
```

After saving the variables, trigger a new Vercel deployment. Environment-variable changes do not update an already-created deployment.

## 13. Apply the database migration

After the variables are set, apply Prisma migrations to the Preview Supabase database from the repository root. Use the same values as `DATABASE_URL` and `DIRECT_URL`, but do not commit them:

```powershell
$env:DATABASE_URL = "<Supabase session-pooler connection string>"
$env:DIRECT_URL = "<Supabase direct connection string>"
pnpm.cmd --filter inbox-zero-ai exec prisma migrate deploy
```

Confirm that the command completes before testing signup.

## 14. Signup verification

1. Open the Preview Vercel URL.
2. Click the Google sign-in button.
3. Sign in with the Google test account.
4. Approve the consent screen.
5. Confirm the callback returns to the application.
6. Refresh the page and confirm the session remains active.
7. Sign out.
8. Sign in again.

If Google reports `redirect_uri_mismatch`, compare the error URL character-for-character with the Google OAuth client's authorized redirect URI. If the app reports a database error, verify the Supabase connection strings and migration status before changing application code.

## 15. Security rules

- Never use `NEXT_PUBLIC_` for secrets.
- Never place `GOOGLE_CLIENT_SECRET`, database URLs, encryption secrets, or API keys in client code.
- Use separate Preview and Production Supabase projects or databases.
- Use different generated secrets for Preview and Production.
- Do not paste secrets into GitHub issues, screenshots, or chat.
- Rotate any secret that was accidentally exposed.
