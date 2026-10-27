# CategorAIze deployment guide: Northflank

This guide deploys CategorAIze as two Northflank services:

```text
Northflank
â”œâ”€â”€ categoraize-web       Next.js application
â”œâ”€â”€ categoraize-nlp       FastAPI NLP service
â”œâ”€â”€ PostgreSQL            application database
â””â”€â”€ Cron jobs             scheduled application endpoints
```

The repository is suitable for this layout. The tracked source is approximately
47 MB. The production Docker configuration excludes `node_modules`, `.next`,
the pnpm store, tests, models, and the NLP service from the web image.

Northflank's Developer Sandbox currently includes two services, one database,
and two jobs/cron workloads. It is intended for hobby and test deployments, so
do not treat the free tier as a production SLA.

## 1. Prerequisites

You need:

- A GitHub repository containing this project.
- A Northflank account and Developer Sandbox project.
- One PostgreSQL database, either Northflank's free database or an external provider such as Supabase.
- OAuth credentials for the providers you want to enable.
- An LLM provider key if AI features are enabled.

Do not commit `.env`, `.env.local`, API keys, OAuth secrets, database passwords,
or the NLP token to Git.

## 2. Create the Northflank project

1. Open Northflank and create a new project.
2. Select the Developer Sandbox/free plan.
3. Choose a region that is available under the Developer Sandbox. Do not select Singapore/SG if Northflank asks you to upgrade. Try `asia-southeast` if it is available to your account; otherwise select another region that the free plan permits.
4. Connect GitHub and grant access only to this repository.

If Northflank asks you to select a paid compute plan or upgrade to Pay as you
go, do not accept it for this free deployment. Go back and choose a
free-eligible region/resource. Northflank projects cannot change region after
creation, so create a new project if the current one is locked to a paid-only
region.

## 3. Create PostgreSQL

Create one PostgreSQL database in the same Northflank project and region.

Copy its connection strings into the web service environment variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
DIRECT_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
```

Use a pooled connection for `DATABASE_URL` if your provider supplies one.
Use a direct/non-pooled connection for `DIRECT_URL`, because Prisma migrations
should not run through a transaction pooler.

If the provider gives you only one URL, use it for both temporarily. A separate
direct URL is still preferable for migrations.

Never put a database URL in a `NEXT_PUBLIC_` variable.

## 4. Deploy the Next.js web service

Create a new Northflank **Service** from the connected Git repository.

Use these settings:

```text
Service name:         categoraize-web
Source:               Git repository
Branch:               main (or your deployment branch)
Build type:           Dockerfile
Dockerfile path:      docker/Dockerfile.prod
Docker build context: repository root (/)
Port:                 3000
Start command:        leave empty; use the Dockerfile CMD
```

The Dockerfile installs production dependencies, builds the Next.js standalone
output, and starts the app through `docker/scripts/start.sh`.

If Northflank asks for a health-check path, use:

```text
/
```

If the platform requires a port setting, use the platform-provided `PORT`
value where supported. The image's start script is designed for hosted
environments.

### Build arguments

Set these only if you need non-default values:

```text
NEXT_PUBLIC_BASE_URL=https://YOUR_NORTHFLANK_DOMAIN
NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true
NEXT_PUBLIC_EMAIL_SEND_ENABLED=true
NEXT_PUBLIC_SELF_HOSTED_LOGIN_FOOTER_TEXT=
NEXT_PUBLIC_CLEANER_ENABLED=true
NEXT_PUBLIC_AUTO_DRAFT_DISABLED=false
NEXT_PUBLIC_MEETING_BRIEFS_ENABLED=true
NEXT_PUBLIC_INTEGRATIONS_ENABLED=true
```

Do not use `NEXT_PUBLIC_` for secrets. Anything with that prefix can be exposed
to browsers.

## 5. Configure web-service environment variables

Add these in the Northflank service's **Environment** or **Secrets** section.
Use secret values for credentials.

### Required base variables

```text
NEXT_PUBLIC_BASE_URL=https://YOUR_NORTHFLANK_DOMAIN
DATABASE_URL=...
DIRECT_URL=...
AUTH_SECRET=GENERATE_A_LONG_RANDOM_VALUE
EMAIL_ENCRYPT_SECRET=GENERATE_A_LONG_RANDOM_VALUE
EMAIL_ENCRYPT_SALT=GENERATE_A_RANDOM_VALUE
INTERNAL_API_KEY=GENERATE_A_LONG_RANDOM_VALUE
API_KEY_SALT=GENERATE_A_LONG_RANDOM_VALUE
```

Generate values locally with OpenSSL or Cloud Shell:

```bash
openssl rand -hex 32
openssl rand -hex 16
```

Use different values for every secret. Do not reuse the database password as an
application secret.

### Google login and Gmail

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PUBSUB_TOPIC_NAME=projects/PROJECT_ID/topics/TOPIC_NAME
GOOGLE_PUBSUB_VERIFICATION_TOKEN=GENERATE_A_LONG_RANDOM_VALUE
```

In Google Cloud Console, add the deployed application's OAuth callback URL to
the authorized redirect URIs. Also add the deployed HTTPS URL to authorized
JavaScript origins. The callback path must match the app's auth configuration;
copy it from the application configuration rather than guessing it.

Google Pub/Sub is optional for an initial login test. If Gmail Pub/Sub is
enabled, configure its topic and push endpoint with the deployed web URL.

### AI provider

Set the provider key and model format used by the app:

```text
LLM_API_KEY=...
DEFAULT_LLMS=provider:model-name
```

The exact provider/model format is documented in `apps/web/.env.example`.
Only configure the provider you actually use.

### Queue and scheduled work

For a basic deployment, use the internal queue unless an external queue is
already configured:

```text
QUEUE_BACKEND=internal
CRON_SECRET=GENERATE_A_LONG_RANDOM_VALUE
```

If using QStash, configure its token/signing keys from
`apps/web/.env.example` and use the deployed public URL for callbacks.

Redis/BullMQ is optional. Do not enable it unless a Redis service exists:

```text
REDIS_URL=...
REDIS_HTTP_URL=...
REDIS_HTTP_TOKEN=...
```

### Optional integrations

Copy only the integrations you need from `apps/web/.env.example`:

- Microsoft: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and related values.
- Slack: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SIGNING_SECRET`.
- Telegram: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_SECRET_TOKEN`.
- Resend: `RESEND_API_KEY` and `NEXT_PUBLIC_IS_RESEND_CONFIGURED=true`.
- Tinybird, Sentry, Axiom, Composio, or Loops: only when those integrations are enabled.

The complete variable reference is:

```text
apps/web/.env.example
```

## 6. Deploy the FastAPI NLP service

Create a second Northflank **Service** from the same Git repository.

Use these settings:

```text
Service name:     categoraize-nlp
Source:           same Git repository
Branch:           main
Root directory:   services/nlp
Build type:       Python/buildpack
Build command:    pip install .
Start command:    uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

If Northflank requires a Dockerfile instead of a Python buildpack, create
`services/nlp/Dockerfile` with:

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port \${PORT:-8000}"]
```

Set this NLP service variable:

```text
NLP_SERVICE_TOKEN=GENERATE_A_LONG_RANDOM_VALUE
```

The service downloads the pretrained SBERT model on first inference. The first
request can therefore be slower. Do not commit the model or a trained
`bilstm-crf.pt` checkpoint to the repository.

## 7. Connect the web app to NLP

After the NLP service is deployed:

1. Copy its internal or public HTTPS service URL.
2. Add these variables to `categoraize-web`:

```text
NLP_SERVICE_URL=https://YOUR_NLP_SERVICE_URL
NLP_SERVICE_TOKEN=THE_SAME_VALUE_AS_THE_NLP_SERVICE
```

3. Redeploy the web service.

The token must be identical in both services. It must never be named
`NEXT_PUBLIC_NLP_SERVICE_TOKEN`.

If Northflank provides private service-to-service networking, use the private
URL. Otherwise use the HTTPS public URL and keep the token enabled.

## 8. Prisma migrations

The application uses Prisma. Run migrations only after the database variables
are correct.

From the repository root:

```powershell
pnpm install
pnpm --filter inbox-zero-ai exec prisma validate --schema prisma/schema.prisma
pnpm --filter inbox-zero-ai exec prisma migrate deploy
```

If PowerShell blocks the `pnpm` shim, use `pnpm.cmd` instead.

The two partial unique indexes for `LoopsEmailSource` are created by raw SQL
in the migration. Prisma schema syntax cannot express those partial indexes, so
do not re-add the invalid `@@unique(... where: ...)` declarations to
`apps/web/prisma/schema.prisma`.

If logs show Prisma error `P1012` at those `LoopsEmailSource` lines, the
deployed branch is missing the schema fix. Push the corrected schema and
redeploy before troubleshooting OAuth.

## 9. Configure cron jobs

Do not configure `* * * * *` in Vercel Hobby. Vercel rejects schedules that
run more than once per day on the free plan.

Use Northflank cron jobs or an external scheduler instead. A job can call an
authenticated web endpoint like this:

```bash
curl --fail --show-error --location \
  "https://YOUR_WEB_SERVICE_URL/api/cron/scheduled-actions" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Example schedules:

```text
0 * * * *       every hour
0 3 * * *       daily at 03:00 UTC
*/15 * * * *    every 15 minutes
```

Use the endpoint's implementation to choose its schedule. Some jobs are
intentionally designed to run frequently. Keep the cron secret in the job's
secret/environment settings, never in the repository.

## 10. Custom domain and OAuth updates

After the web service is live:

1. Add a custom domain in Northflank, if desired.
2. Set `NEXT_PUBLIC_BASE_URL` to the final HTTPS URL.
3. Update Google OAuth authorized origins and redirect URIs.
4. Update Microsoft OAuth redirect URIs if enabled.
5. Update Google Pub/Sub push endpoints if Gmail synchronization is enabled.
6. Redeploy after changing public URL variables.

Do not leave `NEXT_PUBLIC_BASE_URL` pointed to localhost or an old Vercel URL.

## 11. First deployment checklist

Deploy in this order:

1. Create PostgreSQL.
2. Create `categoraize-nlp` and verify its logs.
3. Create `categoraize-web` with database, auth, AI, and NLP variables.
4. Run Prisma migrations.
5. Update OAuth callback URLs.
6. Test the home page.
7. Test Google login.
8. Test one email account connection.
9. Test one AI action.
10. Add cron jobs only after normal requests work.

## 12. Troubleshooting

### Build fails before the application starts

Check that:

- The web build context is the repository root.
- The web Dockerfile is `docker/Dockerfile.prod`.
- The NLP service is not accidentally selected as the web build context.
- The branch contains the current Prisma schema fix.
- The builder has enough memory for dependency installation and the Next.js build.

### `Deployment endpoint was not found`

That error belongs to the Google Cloud deployment command and usually means
a placeholder image, wrong region, or incorrect API target was used. It does not
indicate a Northflank application error. Northflank builds from Git and does
not require `gcloud run deploy`.

### Login returns `internal_server_error`

Check web-service logs in this order:

1. Prisma/database connection errors.
2. Missing `AUTH_SECRET`, encryption secrets, or OAuth credentials.
3. Incorrect Google OAuth callback URL.
4. `NEXT_PUBLIC_BASE_URL` still pointing to localhost or Vercel.
5. Missing `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`.

The browser's minified React error is usually only a symptom. The server log
contains the useful failure.

### NLP requests fail

Verify:

- `NLP_SERVICE_URL` is reachable from the web service.
- `NLP_SERVICE_TOKEN` matches in both services.
- The NLP service listens on `0.0.0.0`, not `127.0.0.1`.
- The first model download has finished.
- The service uses the platform's `$PORT` value.

### Data disappears

Never store application data in the container filesystem. Free containers may
restart or redeploy. Store relational data in PostgreSQL and use external object
storage for durable files.

## 13. Updating the deployment

Normal updates are:

```bash
git add .
git commit -m "describe the deployment change"
git push origin main
```

Northflank redeploys the connected service from the new commit. When changing
environment variables, save them and manually trigger a redeploy if the platform
does not automatically restart the service.

For a schema change:

1. Deploy the new image/code.
2. Run `prisma migrate deploy` against the production database.
3. Confirm the service starts and inspect logs.

Never run `prisma migrate reset` against production.

## 14. Vercel and Cloud Run status

The repository can still be deployed to Cloud Run using the existing
`cloudbuild.yaml`, but that path requires Google Cloud project, Artifact
Registry, image, region, IAM, and environment-variable configuration.

The `apps/web/vercel.json` file currently contains queue triggers and rewrites,
not a Vercel cron definition. The `* * * * *` schedule is in the Kubernetes
Helm chart at `charts/inbox-zero/values.yaml`; do not copy it into a Vercel
Hobby project.

## Useful files

- `apps/web/.env.example`: environment-variable reference.
- `docker/Dockerfile.prod`: production web image.
- `docker/scripts/start.sh`: web container startup.
- `services/nlp/README.md`: local NLP setup.
- `services/nlp/pyproject.toml`: NLP dependencies.
- `apps/web/prisma/schema.prisma`: Prisma schema.
- `cloudbuild.yaml`: existing Cloud Run build/deploy pipeline.
