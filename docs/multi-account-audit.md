# Multi-account audit: Google + Microsoft connected together

Step 1 (discovery) of the multi-account test task. Code-reading only; nothing was run against a mailbox.
Branch audited: `feat/phase-7-contacts-feedback` @ `4f931c9d0`. Paths are relative to `apps/web/` unless they start with `fastapi_core/`.

Legend: **SUPPORTED** = present in code and wired end to end. **PARTIAL** = present but with a gap that affects the multi-account case. **NOT SUPPORTED** = absent.

## Summary

| Area | Google | Microsoft | Notes |
|---|---|---|---|
| Mail (connect, sync, webhook) | SUPPORTED | SUPPORTED | Both feed the same `processHistoryItem` → CategorAIze queue |
| Calendar (busy periods) | SUPPORTED | SUPPORTED | `utils/calendar/unified-availability.ts` reads both |
| CategorAIze calendar boost | SUPPORTED | PARTIAL | Works for both, but only the calendars attached to the *same email account* are used; Outlook accounts usually get no time zone (see C-3) |
| Files (attachment filing) | SUPPORTED | SUPPORTED | Google Drive (`drive.file` scope) and OneDrive (`Files.ReadWrite`) |
| Filing LLM gated by external-LLM consent | PARTIAL | PARTIAL | Gated only by `filingEnabled`; no `CategorizeUserConsent` check (F-2) |
| Per-account isolation of CategorAIze data | SUPPORTED | SUPPORTED | All CategorAIze tables keyed by `emailAccountId` |
| Consent / external-LLM switch | per **user** | per **user** | One switch covers every connected account (by design, but test it) |
| NLP service stateless, no tokens | SUPPORTED | SUPPORTED | Receives only `{start,end}` busy pairs |

## 1. Providers, env vars, OAuth scopes

### Mail — SUPPORTED for both

| Provider | Env vars | Scopes / Graph permissions | Files |
|---|---|---|---|
| Gmail | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PUBSUB_TOPIC_NAME`, `GOOGLE_PUBSUB_VERIFICATION_TOKEN` | `userinfo.profile`, `userinfo.email`, `gmail.modify`, `gmail.settings.basic`; optional `contacts`, `contacts.other.readonly` (when `NEXT_PUBLIC_CONTACTS_ENABLED`) | `utils/gmail/scopes.ts`, `utils/webhook/google/*`, `app/api/google/webhook/route.ts` |
| Outlook | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_WEBHOOK_CLIENT_STATE`, `MICROSOFT_TENANT_ID` (empty = `common`, needed for personal accounts) | delegated: `openid`, `profile`, `email`, `User.Read`, `offline_access`, `Mail.ReadWrite`, `MailboxSettings.ReadWrite`; `Mail.Send` if `NEXT_PUBLIC_EMAIL_SEND_ENABLED`; optional `Contacts.Read`, `People.Read` | `utils/outlook/scopes.ts`, `utils/webhook/outlook/*`, `app/api/outlook/webhook/route.ts`, `app/api/outlook/watch/*` |

Sign-in is Better Auth social providers (`utils/auth.ts:221`). Adding a second mailbox goes through the linking routes (`app/api/google/linking/*`, `app/api/outlook/linking/*`).

### Calendar — SUPPORTED for both

| Provider | Scopes | Callback | Files |
|---|---|---|---|
| Google Calendar | `calendar.readonly`, `calendar.events`, `calendar.freebusy` (+ profile/email) | `/api/google/calendar/callback` | `utils/gmail/scopes.ts` (`CALENDAR_SCOPES`), `utils/calendar/providers/google*.ts` |
| Outlook Calendar | `Calendars.Read`, `Calendars.ReadWrite`, `offline_access`, `User.Read` | `/api/outlook/calendar/callback` | `utils/outlook/scopes.ts` (`CALENDAR_SCOPES`), `utils/outlook/calendar-client.ts`, `utils/calendar/providers/microsoft*.ts` |

Note: both request **write** scopes (`calendar.events`, `Calendars.ReadWrite`) although the boost only reads. Our tests stay read-only.

### Files — SUPPORTED for both

| Provider | Scopes | Callback | Files |
|---|---|---|---|
| Google Drive | `drive.file` by default (only files the app created/opened); `drive` when the user picks full access | `/api/google/drive/callback` | `utils/drive/scopes.ts`, `utils/drive/client.ts:45`, `utils/drive/providers/google.ts` |
| OneDrive / SharePoint | `Files.ReadWrite` (not `.All`) | `/api/outlook/drive/callback` | `utils/drive/scopes.ts`, `utils/drive/providers/microsoft.ts` |

With `drive.file`, listing Google Drive shows only app-created folders/files, so a read-only "list" test on a fresh account returns little. SharePoint sites beyond the user's OneDrive and "shared with me" are limited by `Files.ReadWrite` (no `Sites.*`): **PARTIAL** for SharePoint.

### Full list of OAuth redirect URIs (local)

- Google: `http://localhost:3000/api/auth/callback/google`, `/api/google/linking/callback`, `/api/google/calendar/callback`, `/api/google/drive/callback`
- Microsoft: `http://localhost:3000/api/auth/callback/microsoft`, `/api/outlook/linking/callback`, `/api/outlook/calendar/callback`, `/api/outlook/drive/callback`

### Local state (read-only check, 2026-11-15)

`.env`: Google and Microsoft client ID/secret are **set** (values not printed); `MICROSOFT_TENANT_ID` unset (= `common`, OK for personal accounts); `CATEGORAIZE_ENABLED=true`; all five `CATEGORAIZE_*` feature switches **unset** (off); `OPENROUTER_API_KEY` set.
DB: 1 user, 1 Google `Account`, 1 connected Google calendar, 0 Drive connections, 0 Microsoft accounts, filing disabled, latest consent row has external LLM **off**.

## 2. Account model and scoping

- `User` 1 → n `Account` (OAuth tokens per provider) and 1 → n `EmailAccount` (one per mailbox, `email` unique). The app URL is `/[emailAccountId]/...`; switching accounts changes that id.
- `CalendarConnection` and `DriveConnection` belong to an **email account**, not the user (`prisma/schema.prisma:1568`, `:1952`). A calendar of either provider can be attached to either mailbox (`@@unique([emailAccountId, provider, email])`); Drive allows one per provider per mailbox (`@@unique([emailAccountId, provider])`).

| CategorAIze data | Scope | Where |
|---|---|---|
| Categories (`CategorizeCategory`, incl. Rocchio `centroidEmbedding`) | email account; `@@unique([emailAccountId, name])` → same name in two accounts is allowed | `schema.prisma:2997` |
| Sender centroids (`CategorizeSenderCategoryCentroid`), sender embeddings | email account | `schema.prisma:3203`, `:3220` |
| Classifications, spans, feedback events | email account; classification unique on `(emailAccountId, threadId, messageId)` | `schema.prisma:3031`, `:3115`, `:3160`; upsert in `utils/categoraize/process-email.ts:138` |
| Priority overrides (`CategorizePriorityOverrideLog`) | email account | `schema.prisma:3178` |
| Contacts / VIP / role (`CategorizeContact`) | email account; unique `(emailAccountId, email)` → same sender in two accounts is two rows | `schema.prisma:3143` |
| Rules (upstream `Rule`) | email account | `schema.prisma:722` |
| Proposals, deadline alerts, notifications | email account | `schema.prisma:3237`, `:3267`, `:3297` |
| **Consent + external-LLM switch** (`CategorizeUserConsent`) | **user** — one switch for all mailboxes | `schema.prisma:3251`, `utils/categoraize/consent.ts` |
| Feature switches `CATEGORAIZE_*` | deployment (env), global | `utils/categoraize/features.ts`, `env.ts` |
| Time zone used for deadline resolution | email account (`EmailAccount.timezone`) | `process-email.ts:277-313` |
| Queue dedup | `${emailAccountId}:${threadId}:${messageId}` | `utils/categoraize/queue.ts` |

All CategorAIze FKs cascade on email-account delete. No CategorAIze table is keyed by user except consent.

## 3. Calendar and attachment-filing code, and LLM use

### Calendar
- Busy periods: `utils/calendar/unified-availability.ts` (Google freebusy via `providers/google-availability.ts`; Outlook `calendarView` with `Prefer: outlook.timezone="UTC"` and a `Z` appended, `providers/microsoft-availability.ts:38-67`; events with `showAs = free` skipped). **No LLM.**
- CategorAIze boost feed: `utils/categoraize/calendar-busy.ts` (14-day window, 10-min in-process cache keyed by `emailAccountId`) → `process-email.ts:309` → `calendar_busy` in `POST /api/v1/classify` → `fastapi_core/app/ml/priority_rules.py:44-46` (`+1` if any busy period contains the nearest validated deadline; `any()` so a meeting in both calendars counts once).
- LLM in the calendar area: `utils/ai/calendar/availability.ts` (availability text for drafts; external LLM, part of drafts, consent-gated via the drafts path) and meeting briefs (upstream). Not used by the boost.

### Attachment filing
- Engine: `utils/drive/filing-engine.ts` → `processAttachment()`; callers `utils/drive/process-filing-attachments.ts` (from `utils/webhook/process-history-item.ts`), `utils/actions/drive.ts:335`, `app/api/user/drive/preview/route.ts:195`.
- **LLM calls:** `utils/ai/document-filing/analyze-document.ts:86` (where to file) and `utils/ai/document-filing/parse-filing-reply.ts:89` (reads the user's reply to a filing notice). Both use `createGenerateObject` → the configured external LLM (OpenRouter).
- Gate today: `emailAccount.filingEnabled && filingPrompt` only (`filing-engine.ts:93`). **No call to `isExternalLlmAllowed` / `hasExternalLlmConsent`.** Already listed under "Still on the external LLM without a consent check" in `docs/llm-call-sites.md:34,75`.

## 4. CategorAIze hooks — present / missing

| Hook | Status | Evidence |
|---|---|---|
| Classify call on new mail, both providers | SUPPORTED | `utils/webhook/process-history-item.ts:34-35` (shared by `webhook/google/` and `webhook/outlook/`) → `utils/categoraize/queue.ts` → `app/api/categorai/process` → `process-email.ts` |
| Calendar boost, Google + Outlook | SUPPORTED (with C-1..C-3 below) | `calendar-busy.ts`, `unified-availability.ts` |
| Missing/failed calendar stays neutral | SUPPORTED | `priority_rules.py:44` (`None`/`[]` → boost 0, never negative); provider errors caught and return `[]` (`unified-availability.ts`, `failClosed=false`); `calendar-busy.ts` catches and returns `null` |
| Service receives only busy start/end | SUPPORTED | `BusyPeriod = {start,end}` (`utils/calendar/availability-types.ts`); service schema `extra="forbid"` (`fastapi_core/app/schemas.py:25,55-70`); auth is a single `X-Internal-Key` (`utils/categoraize/client.ts:304`) |
| Service stateless | SUPPORTED | No DB/Redis client in `fastapi_core/app`; only `lru_cache` of static lexicons and the global rule prototypes file (`rule_matcher.py:100`). Categories+centroids are sent per request. |
| Feature switches | SUPPORTED, global | `utils/categoraize/features.ts` (all five unset locally) |
| Cascade honours consent | SUPPORTED | `runCategoraizeCascade` / `runCategoraizeOrLlm` (`features.ts`) |
| Filing LLM consent gate | **MISSING** (F-2) | `filing-engine.ts:93` |
| Per-user vs per-account consent | by design per user | `consent.ts` |

### Findings to verify in Step 2

- **C-1 (calendar scope per mailbox).** The boost for a Gmail email uses only calendars connected *to the Gmail email account*; an Outlook calendar connected only under the Outlook mailbox is ignored, and vice versa. The user's busy time is therefore not unioned across mailboxes unless they connect both calendars to each mailbox. PARTIAL.
- **C-2 (silent partial failure).** With `failClosed=false`, a broken token on one calendar returns `[]` for that calendar, and `calendar-busy.ts` caches the partial result for 10 min with no "calendar unavailable" log line (its own `catch` only fires on a thrown error). Neutral (never lowers priority) but invisible.
- **C-3 (Outlook time zone).** `EmailAccount.timezone` is auto-filled from the primary calendar's `timeZone` (`utils/calendar/timezone-helpers.ts`). Microsoft calendars are saved with `timezone: null` (`providers/microsoft.ts:97,105`) and Graph calendars carry no IANA zone, so an Outlook-only mailbox likely keeps `timezone = null` → requests go out with `"UTC"` → an Asia/Manila "5pm Friday" deadline resolves 8 h late. PARTIAL until tested.
- **F-2 (filing not consent-gated).** With external LLM OFF but `filingEnabled` ON, attachments still go to the external LLM. PARTIAL.
- **X-1 (one consent for all mailboxes).** Turning external AI on in one mailbox's settings turns it on for the other. Expected by the schema; Step 2 will confirm the UI says so.

## 5. Manual preparation (owner: the user)

1. **Test accounts (throwaway only).** One Google account (Gmail, Calendar, Drive) and one personal Microsoft account (Outlook.com, Calendar, OneDrive). Never real mailboxes.
2. **Azure app registration** (portal.azure.com → App registrations). The app ID/secret in `.env` are already set; confirm they belong to an app that:
   - Supported account types: *Accounts in any organizational directory and personal Microsoft accounts* (keep `MICROSOFT_TENANT_ID` empty).
   - Web redirect URIs: the four Microsoft URIs in §1.
   - API permissions (Microsoft Graph, delegated): `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Mail.ReadWrite`, `MailboxSettings.ReadWrite`, `Calendars.Read`, `Calendars.ReadWrite`, `Files.ReadWrite` (+ `Mail.Send`, `Contacts.Read`, `People.Read` only if those env flags are on). Personal accounts need no admin consent.
   - Client secret not expired.
3. **Google Cloud project** (same project as `GOOGLE_CLIENT_ID`): enable Gmail API, Google Calendar API, Google Drive API, Cloud Pub/Sub API; OAuth consent screen in *Testing* with the test Google account added as a test user; add the four Google redirect URIs from §1.
4. **Webhooks for live new-mail tests.** Gmail push needs the Pub/Sub topic in `GOOGLE_PUBSUB_TOPIC_NAME` with a push subscription to `https://<public-host>/api/google/webhook?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`. Outlook subscriptions need a public HTTPS `notificationUrl`. Locally, run **ngrok** (`ngrok http 3000`) and point the Pub/Sub push endpoint and the app's webhook base URL at it. Without this, "new-mail arrival" can only be tested by manual sync.
5. **Test data (create by hand, nothing created by us):**
   - In each mailbox, the same three emails sent from a third address, subjects `CATZ-TEST 1 deadline`, `CATZ-TEST 2 newsletter`, `CATZ-TEST 3 taglish request`, identical bodies (bodies will be given in Step 2).
   - One email from the **same sender address** to both mailboxes.
   - In each calendar, a busy event in the next 7 days (e.g. Friday 16:00–18:00 Asia/Manila), plus one event at the **same time in both calendars**.
   - Set both accounts' time zone to Asia/Manila (Google Calendar settings; Outlook.com → Settings → Calendar → Time zone).
6. **Keep external AI OFF** (current state) and filing OFF, unless a specific test asks you to switch it.
