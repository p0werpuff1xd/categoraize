# Local setup: Gmail and Outlook side by side

How to run CategorAIze locally with a Google mailbox and a Microsoft mailbox connected at the same time. These steps came out of the multi-account tests (`docs/multi-account-test-report.md`).

## 1. Start Docker services with the app's env file

The Redis HTTP proxy takes its token from `${REDIS_HTTP_TOKEN}` when `docker compose` builds the container. Compose fills `${...}` from your shell or a root `.env`, **not** from `env_file`, so a plain `docker compose up` creates the proxy with an empty token. Every Redis call from the app then fails with `Invalid token`, and adding an Outlook mailbox crashes in `/api/outlook/linking/callback`.

Always pass the app's env file:

```bash
docker compose -p inbox-zero-services --env-file apps/web/.env --profile local-redis up -d
```

If the containers already exist, recreate only the proxy (it holds no data):

```bash
docker compose -p inbox-zero-services --env-file apps/web/.env --profile local-redis up -d --no-deps --force-recreate serverless-redis-http
```

Check: `curl -s -H "Authorization: Bearer <REDIS_HTTP_TOKEN>" -H "Content-Type: application/json" -d '["PING"]' http://localhost:8079/` returns `{"result":"PONG"}`.

## 2. Microsoft account requirements

- The Azure app must allow **personal Microsoft accounts** (Overview → Supported account types → "All Microsoft account users"); keep `MICROSOFT_TENANT_ID` empty. See `docs/hosting/microsoft-oauth.mdx` for redirect URIs and Graph permissions.
- **Each email address can be connected once.** A Microsoft account whose sign-in address is a Gmail address reports that Gmail address to the app, so it cannot be added beside the Gmail mailbox (the accounts page shows "Email address already connected"). Use a Microsoft account with its own Outlook.com / work address. For a personal account you can add an Outlook.com alias and make it primary at account.microsoft.com → Your info → Manage how you sign in.
- Add the second mailbox while signed in: `/accounts` → **Add account** → **Microsoft**. Do not use "Sign in with Microsoft" on the login page for an address that already belongs to a user.
- Outlook calendars carry no time zone. CategorAIze reads the Outlook mailbox time zone (`/me/mailboxSettings/timeZone`) the first time it classifies mail for that mailbox, so "Friday 5pm" resolves in the right zone. If that fails, it uses the time zone of the user's other mailbox, then UTC.

## 3. Live new-mail notifications (optional)

Gmail push (Pub/Sub) and Outlook subscriptions need a public HTTPS URL. Without one, new mail only appears after a manual sync.

1. `ngrok http 3000` and copy the `https://…ngrok-free.app` URL.
2. In `apps/web/.env` set `WEBHOOK_URL=https://<subdomain>.ngrok-free.app` (keep `NEXT_PUBLIC_BASE_URL=http://localhost:3000` for OAuth) and restart the app. Outlook subscriptions use `WEBHOOK_URL || NEXT_PUBLIC_BASE_URL` (`apps/web/utils/outlook/watch.ts`).
3. Gmail: create a push subscription on the topic in `GOOGLE_PUBSUB_TOPIC_NAME` to `https://<subdomain>.ngrok-free.app/api/google/webhook?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`.
4. The free ngrok URL changes on every restart; update `WEBHOOK_URL` and the push endpoint each time.

## 4. What is shared between mailboxes

- **External AI consent** is one switch per user: turning it on in one mailbox's settings turns it on for all of them. Attachment filing and AI drafts both need it.
- **Calendar boost** uses busy periods from every calendar connected under any of the user's mailboxes.
- Everything else CategorAIze stores (categories, centroids, priority overrides, contacts, deadlines) is per mailbox.

## 5. Tests

Read-only multi-account checks: `scripts/test-multi-account/README.md`.
