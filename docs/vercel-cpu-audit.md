# CategorAIze — Vercel Fluid Active CPU Audit Report

**Date:** 2026-11-18
**Auditor:** Claude Opus 4.6
**Scope:** Full repository audit of Vercel Hobby free-tier CPU consumption

---

## A. Executive Summary

CategorAIze is consuming excessive Vercel Fluid Active CPU because it inherited
Inbox Zero's SaaS-scale background processing infrastructure — 13 Vercel cron
jobs, QStash-based queue dispatch, and Gmail push webhook cascades — and runs
all of it without the premium-tier gating that would limit it to paying users.
On the Hobby plan, every one of these crons fires for every user, most functions
exceed the 60-second Hobby execution limit, and the queue fallback mechanism
creates self-referential HTTP requests that spawn additional function
invocations.

**Confirmed root causes (ranked by impact):**

1. **13 Vercel crons produce ~67,800 invocations/month** (68% of the 100K
   Hobby limit) before any user traffic. `scheduled-actions` alone fires every
   minute (43,200/month).

2. **`NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true`** disables all premium gating, so
   every cron processes every user — a feature designed for SaaS with thousands
   of paying users now treats one self-hosted user the same way.

3. **No QStash token configured** — the queue dispatch falls back to `after()`
   with an HTTP `fetch()` to the app's own API, creating a cascade of function
   invocations (webhook → history processing → rule execution → CategorAIze
   enqueue → new function invocation).

4. **`maxDuration` values (300–800s) exceed Hobby's 60s limit** — functions are
   killed mid-execution, potentially leaving inconsistent state and triggering
   retries.

5. **Gmail webhook `after()` cascade** — each incoming email notification
   triggers: webhook acknowledgement → `after()` background processing →
   history fetch → message processing → rule matching → CategorAIze enqueue →
   another function invocation. Each email can consume 3–5 function invocations.

6. **Unused feature crons still fire** — meeting-briefs (every 15 min),
   meeting-recorder (every 5 min), follow-up-reminders (hourly), digest (every
   5 min) all query the database even when no users have these features enabled.

---

## B. Root Cause Analysis

| # | Issue | Evidence | Severity | Affected Files | Solution |
|---|-------|----------|----------|---------------|----------|
| 1 | 13 crons = 67,800 invocations/month | `apps/web/vercel.json` crons section | **Critical** | `vercel.json` | Disable unused crons; reduce frequency of others |
| 2 | `scheduled-actions` fires every minute | `"schedule": "* * * * *"` | **Critical** | `vercel.json` | Change to every 5–15 minutes |
| 3 | Premium bypass = all users processed | `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true` in `.env` | **Critical** | `.env`, Vercel env vars | Keep bypass but crons don't need it — they already iterate all accounts |
| 4 | No QStash = self-calling HTTP cascade | No `QSTASH_TOKEN` in env; `fallbackPublishToQstash` uses `after(fetch())` | **High** | `utils/upstash/index.ts`, `utils/queue/dispatch.ts` | For single-user: process inline instead of enqueuing |
| 5 | maxDuration exceeds Hobby limit | `maxDuration = 300–800` on 10+ routes | **High** | All cron and heavy API routes | Cap at 60s for Hobby |
| 6 | Gmail webhook creates 3–5 invocations per email | `after()` in webhook + `enqueueBackgroundJob` → internal fetch | **High** | `api/google/webhook/route.ts`, `utils/webhook/process-history-item.ts` | Process CategorAIze inline instead of re-enqueuing |
| 7 | Meeting/digest/recorder crons fire for unused features | Crons query DB even when 0 users have features enabled | **Medium** | `vercel.json`, respective route files | Remove from crons config |
| 8 | Vercel Queues dispatch on Hobby (may not be available) | `isVercelQueueDispatchEnabled()` returns true on Vercel | **Medium** | `utils/queue/vercel.ts` | Falls back gracefully but wastes an attempt |
| 9 | `watch/all` has maxDuration=800, iterates all accounts hourly | Renews Gmail push subscriptions | **Medium** | `api/watch/all/route.ts` | Single-user: fast, but cap maxDuration |
| 10 | Duplicate Redis clients possible | Multiple imports of `utils/redis/index.ts` | **Low** | `utils/redis/index.ts` | Singleton pattern already in place |

---

## C. Vercel Hobby Plan Limits (as of late 2026)

| Resource | Hobby Limit | CategorAIze Current Usage |
|----------|------------|--------------------------|
| Fluid Active CPU | 100 hours/month | **~4+ hours observed** |
| Function Invocations | 100,000/month | **~67,800 from crons alone** |
| Max Function Duration | 60 seconds | **Routes configured for 300–800s** |
| Serverless Functions | 12 per deployment | Exceeded (many API routes) |
| Cron Jobs | 2 per deployment (Hobby) | **13 configured** |
| Build Minutes | 100 minutes/month | Unknown |

**Critical:** Vercel Hobby allows only **2 cron jobs**. CategorAIze configures
13. Vercel may silently disable excess crons or run only the first two. This
means some crons may never fire while others fire constantly.

---

## D. Cron Job Inventory

| Cron | Schedule | Invocations/Month | maxDuration | Purpose | Needed for CategorAIze? |
|------|----------|-------------------|-------------|---------|------------------------|
| `/api/cron/scheduled-actions` | `* * * * *` | 43,200 | 300s | Scheduled emails, snoozed threads | Partially (snoozed threads) |
| `/api/resend/digest/all` | `*/5 * * * *` | 8,640 | 300s | Email digest | No (premium feature) |
| `/api/meeting-recorder/schedule` | `*/5 * * * *` | 8,640 | 800s | Meeting recordings | No (not used) |
| `/api/meeting-briefs` | `*/15 * * * *` | 2,880 | 800s | Meeting briefs | No (not used) |
| `/api/cron/automation-jobs` | `*/15 * * * *` | 2,880 | 300s | AI rule automation | Partially |
| `/api/watch/all` | `0 * * * *` | 720 | 800s | Gmail push renewal | **Yes** |
| `/api/follow-up-reminders` | `0 * * * *` | 720 | 800s | Follow-up tracking | No (not configured) |
| `/api/resend/inbox-health/all` | `0 8 * * *` | 30 | 300s | Weekly inbox health email | No |
| `/api/cron/reasoning-retention` | `0 3 * * *` | 30 | 300s | Delete old LLM reasoning | Optional |
| `/api/cron/mobile-push-retention` | `30 3 * * *` | 30 | 300s | Delete old push logs | Optional |
| `/api/cron/email-send-operation-retention` | `45 3 * * *` | 30 | 300s | Delete old send ops | Optional |
| `/api/cron/draft-cleanup` | `0 4 * * *` | 30 | 300s | Delete stale AI drafts | Optional |
| `/api/resend/summary/all` | `0 9 * * 1` | 4 | 300s | Weekly summary email | No |

**Essential for CategorAIze:** Only `watch/all` (Gmail push subscription
renewal) and optionally `scheduled-actions` (for snoozed threads).

---

## E. Gmail Webhook Processing Chain

Each incoming Gmail notification triggers this cascade:

```
Gmail Pub/Sub notification
  → POST /api/google/webhook (function invocation #1)
    → Acknowledge immediately (200 OK)
    → after() → processHistoryForUser
      → Gmail API: history.list (fetches changed messages)
      → For each new message:
        → processHistoryItem (rule matching, categorization)
          → withMessageProcessingLock (Redis)
          → enqueueCategoraizeProcessing
            → enqueueBackgroundJob
              → No QStash → fallbackPublishToQstash
                → after(fetch("/api/categorai/process"))
                  → Function invocation #2
                    → classifyAndStoreEmail
                      → fetch(CATEGORAIZE_SERVICE_URL) → FastAPI NLP
                      → DB writes (classification, spans, embedding)
```

**For a single email, this creates 2+ function invocations**, plus DB queries,
Redis operations, and an external HTTP call to the NLP service.

---

## F. Redis Configuration Status

| Variable | In `.env` | In `env.ts` | Used By |
|----------|-----------|-------------|---------|
| `REDIS_HTTP_URL` | ✅ Set | ✅ Primary | `@upstash/redis` client |
| `REDIS_HTTP_TOKEN` | ✅ Set | ✅ Primary | `@upstash/redis` client |
| `REDIS_URL` | ✅ Set | ✅ Optional | BullMQ worker (not used on Vercel) |
| `QSTASH_TOKEN` | ❌ Not set | ✅ Optional | Queue dispatch (falls back to internal) |
| `KV_REST_API_URL` | ❌ Not set | ✅ Fallback | Legacy Vercel KV |
| `REDISTORAGE_*` | ❌ Not in codebase | N/A | Not referenced anywhere |

**Status:** Redis HTTP is correctly configured. The `REDISTORAGE_` prefix
mentioned in the brief does not appear anywhere in the codebase. If the new
Redis store exposes variables with that prefix, they need to be mapped to
`REDIS_HTTP_URL` and `REDIS_HTTP_TOKEN` in the Vercel environment settings.

No infinite retry loops were found in the Redis client. The `@upstash/redis`
client handles reconnection internally. Message processing uses Redis locks
(`withMessageProcessingLock`) for deduplication.

---

## G. Optimization Plan

### Priority 1: Reduce Cron Invocations (Critical)

**Action:** Reduce vercel.json crons to only the 2 allowed on Hobby.

Keep:
- `watch/all` at `0 */6 * * *` (every 6 hours instead of hourly — Gmail push
  subscriptions last 7 days)
- `scheduled-actions` at `*/15 * * * *` (every 15 min instead of every minute)

Remove all others. They serve premium SaaS features CategorAIze doesn't use.

**Expected reduction:** ~67,800 → ~3,870 invocations/month (94% reduction)

### Priority 2: Cap maxDuration (Critical)

**Action:** Set `maxDuration = 60` on all routes. Hobby plan kills functions at
60s regardless of the declared value, so the declarations are misleading.

### Priority 3: Process CategorAIze Inline (High)

**Action:** When no QStash is configured, call `classifyAndStoreEmail` directly
in the webhook handler instead of enqueuing via `after(fetch())`. This
eliminates one function invocation per email.

### Priority 4: Add Early Returns to Remaining Crons (Medium)

**Action:** Add fast-path returns when features are unconfigured or no eligible
accounts exist, so the function exits in <1s instead of running full processing.

### Priority 5: Vercel Environment Variables (Medium)

**Action:** If the new Redis store uses `REDISTORAGE_*` prefixes, add these
mappings in the Vercel dashboard:
- `REDIS_HTTP_URL` = value of `REDISTORAGE_REST_URL`
- `REDIS_HTTP_TOKEN` = value of `REDISTORAGE_REST_TOKEN`

---

## H. Architecture Recommendation

```
Current (SaaS-inherited):
  Vercel ──→ 13 crons ──→ DB queries ──→ Queue dispatch ──→ Self-calls
       ↑                                                        │
       └────────────────────────────────────────────────────────┘

Optimized (single-user Hobby):
  Vercel ──→ 2 crons (watch + scheduled-actions)
       │
       ├──→ Gmail webhook ──→ Inline processing ──→ FastAPI NLP
       │                                              (external)
       └──→ User requests ──→ Direct DB/API calls
```

The key insight: CategorAIze is a single-user application on Hobby. The
fan-out queue architecture designed for processing thousands of users in
parallel is pure overhead. Process everything inline.

---

## I. Deployment Checklist

1. ☐ Update `vercel.json` crons (this commit)
2. ☐ Cap `maxDuration` on all routes
3. ☐ Verify Redis env vars match in Vercel dashboard
4. ☐ Verify `CRON_SECRET` is set in Vercel env
5. ☐ Monitor Vercel usage dashboard after deploy for 48 hours
6. ☐ If `REDISTORAGE_*` vars exist in Vercel, map them to `REDIS_HTTP_*`

---

## J. Monitoring Plan

| Metric | Warning Threshold | Action |
|--------|-------------------|--------|
| Fluid Active CPU | >50 hours/month | Review function logs for long-running invocations |
| Function Invocations | >50,000/month | Check cron frequency, reduce if needed |
| Failed Requests | >100/day | Check Redis connectivity, NLP service health |
| Gmail Webhook Errors | >10/day | Check token validity, rate limit state |
| Function Duration p95 | >30s | Identify slow endpoints, add caching |

---

## K. Remaining Risks

1. **NLP service availability:** If the FastAPI service is down, classification
   retries will consume CPU. The 20s timeout per request is reasonable.

2. **Gmail history gaps:** Reducing `watch/all` to every 6 hours means if the
   push subscription lapses, there could be a 6-hour gap. Gmail subscriptions
   last 7 days, so this is safe with margin.

3. **Hobby cron limit:** Vercel Hobby officially supports only 2 crons. If
   Vercel enforces this strictly, only the first 2 in the config will run.
   This is actually desirable — it naturally limits overhead.

4. **Production Supabase:** The audit did not connect to or modify Supabase.
   Production deployment changes require separate approval.
