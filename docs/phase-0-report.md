# Phase 0 report (revised master plan, 2026-11-16)

Read-only audit. No production code changed. Branch `feat/phase-0-ias-audit`
(from `feat/phase-8-consent-docs` @ `1b9dbf1d1`). Security details are in
[`docs/ias/control-matrix.md`](ias/control-matrix.md); the Google + Microsoft
audit is in [`docs/multi-account-audit.md`](multi-account-audit.md) (written
by a separate session, not committed here).

## Urgent

A Supabase database connection string with a real-looking password is in
`docs/plans/deployment-environment-setup.md` (line 344), added in commit
`b049db249` on 2026-10-20. It is in the current tree and on the **public**
GitHub repository `p0werpuff1xd/categoraize` (`main`, `chore/remove-marketing`,
`delete-files`, `feature/prd-v7-inbox-zero-parity`). Treat it as compromised:
reset the Supabase database password. Deleting the file afterwards does not
remove it from history; that needs a history rewrite and force-push, or making
the repository private, which is your decision.

## 0.1 Git baseline

- Tag `pre-categoraize` exists; remotes `origin` (GitHub, public), `upstream`
  (elie222/inbox-zero), `local-d` (the old D: clone).
- Fork point with upstream: `e133a3a68` (2026-11-12). The fork is **96 commits
  ahead and 43 behind** `upstream/main`; 37 commits since `pre-categoraize`.
  `git diff --stat upstream/main...HEAD`: 454 files, +30,424 / -10,329, mostly
  `apps/web/utils/` (25%), `fastapi_core/` (20%), removed landing pages (16%).
- None of the `feat/phase-*` branches are on GitHub; all CategorAIze phase
  work exists only locally (on E:, with phases 0-3 also in the D: copy).

## 0.2 Repo hygiene and versions

- Ignored: `.env`, `.env.local`, `apps/web/.env*`, `.pnpm-store`, `.next`,
  `.turbo`, `fastapi_core/.venv`. Tracked env files: only the two `.env.example`.
- No tracked file is larger than 3 MB. Tagger weights are tracked on purpose
  (`fastapi_core/models/tagger/v1..v6`, 0.6-1.3 MB each).
- Node 24.22.3 matches `.nvmrc` (24) and `engines` (24.x); pnpm 12.18.0 matches
  `packageManager`.
- `pnpm-workspace.yaml` covers `apps/*` and `packages/*` only, so
  `fastapi_core/` is outside the workspace.
- `models/` does not exist. `services/nlp/` is an earlier experiment
  (SBERT + Passive-Aggressive classifier + BiLSTM-CRF, commit `c233482c1`),
  superseded by `fastapi_core/`. Left untouched.
- The web package is named `inbox-zero-ai`, so the plan's
  `pnpm --filter web ...` commands need `--filter inbox-zero-ai`. The type
  check baseline is 1,186 errors, all but one in test files (upstream).

## 0.3 Branding branches

- `chore/remove-marketing` is merged into the current work.
- There is no `chore/rebrand-categoraize` branch locally or on GitHub. The
  name comes from `NEXT_PUBLIC_BRAND_NAME` (default `"Categoraize"` in
  `apps/web/env.ts`). Some upstream strings still say "Inbox Zero"
  (3 draft-signature tests fail on this).

## 0.4 Running the original app

- Runs in dev mode against **local Docker Postgres 16.15 (pgvector)**, not
  Supabase. `DATABASE_URL` and `DIRECT_URL` both point at `localhost:5432`.
  `prisma.config.ts` reads `DIRECT_URL` for migrations (Prisma 7 moved this
  out of `schema.prisma`, which has no `directUrl`).
- Google: signed in, Gmail and Google Calendar connected; Pub/Sub topic set.
  Drive: not connected. Microsoft: client ID and secret are set; no Microsoft
  account connected yet (Azure steps are in the multi-account session).
- OpenRouter key set; `DEFAULT_LLM_PROVIDER` unset.
- Not re-verified today: assistant rules, cleanup, analytics and attachment
  filing on the original paths.

## 0.5 LLM call sites

`docs/llm-call-sites.md` exists and is current through the R1 swaps (rule
matching, smart categories, cold email, summaries, Reply Zero status as a
local-first cascade). Gaps: attachment filing is not gated by the external-LLM
consent (multi-account audit F-2); assistant chat and Telegram are ungated by
decision (2026-11-15).

## 0.6 IAS discovery (summary; details in the control matrix)

- (a) OAuth tokens: AES-256-GCM at rest via the fork's Prisma extension
  (`utils/prisma-extensions.ts`, `utils/encryption.ts`); verified as
  ciphertext in the local DB. Email-derived text in plaintext: CategorAIze's
  `CategorizeClassification.bodyText/snippet/subject/summary` and
  `CategorizeExtractedSpan.text`, plus upstream tables such as
  `ExecutedAction.content`, `DigestItem.content`, `ChatMemory.content`,
  `ReplyMemory.content`.
- (b) Locally the app connects as `postgres` (superuser, BYPASSRLS). The
  Supabase role was **not** queried (needs your approval).
- (c) 303 API routes: 261 use a session/cron/QStash/webhook wrapper; 42
  delegate to helpers (queue forwarders on `@vercel/queue`, OAuth callbacks,
  public booking pages, webhooks) and need a manual review. All 11 CategorAIze
  routes are authenticated.
- (d) Account deletion exists (`utils/user/delete.ts`; all CategorAIze tables
  cascade) but does not revoke provider tokens. No data export. Security
  headers present (CSP enforced, HSTS, X-Frame-Options, nosniff,
  Referrer-Policy); no Permissions-Policy. Rate limiting only on public
  booking links and email OTP. Signed OAuth state with constant-time
  comparison; PKCE on social sign-in; 30-day sessions.
- (e) Scopes: see the multi-account audit. Calendar requests write scopes
  although CategorAIze only reads busy periods.
- (f) Local Postgres 16.15; `pg_dump` is not installed on Windows (the Docker
  image has 16.15). The Supabase server version is unknown; `pg_dump` must be
  the same major version or newer.
- (g) `pnpm audit --prod`: 3 high (zod, prosemirror-view, source-map-js),
  4 moderate, 1 low. `gitleaks` and `pip-audit` are not installed (need your
  approval). A pattern scan of the current tree found only the Supabase URL
  above.

## Where the revised plan meets work already done

| Revised phase | State | Notes |
| --- | --- | --- |
| 1 NLP service | Done | `register` / `register_cues` are **not** in the `/classify` response yet |
| 2 Data and wiring | Done on local Postgres | Supabase not connected |
| 3 UI | Done | sandbox does not show register |
| 4 Bi-LSTM-CRF | Done (v6) | `retrain.py`, versioned models, regex fallback |
| 5 Evaluation | Partial | tagger and rule-matching evaluations exist; missing the 130-email gold set, baselines B1/B2/B4, `run_eval.py`, `docs/evaluation.md`, bootstrap CIs, by-language category accuracy |
| 6 Replace the AI | Done | attachment filing not consent-gated |
| 7 IAS foundation | Not started | consent toggle exists; no gate, notice pages, audit log, backups |
| 8 Calendar, search | Done for Google | Outlook untested; Outlook time zone gap (audit C-3) |
| 9 Polish | Mostly done | contacts, suggested labels, proposals done; register-aware drafting and tone chip not done |
| 10 Data rights, hardening | Not started | |
| 11 Encryption, masking, RLS | Not started | |
| 12 Wrap-up | Partial | README, demo of scenarios 1-5, screenshots done; scenarios 6-8 and the demo states list not |

Earlier branches used the first plan's numbers (`feat/phase-5-replace-ai`,
`feat/phase-7-contacts-feedback`, ...). New work will use distinct names, e.g.
`feat/phase-7-ias-foundation`, to avoid clashes.

## Contradictions with the revised plan

1. **D: vs E:** the plan says keep everything on D:. On 2026-11-12 you approved
   moving to `E:\categoraize\categoraize` (D: is a slow disk); D: is a stale
   copy without phases 4-8. Work continues on E: unless you say otherwise.
2. **Supabase:** the plan's target database is hosted Supabase; the app runs
   on local Docker. Connecting needs your approval (first production
   connection).
3. **Cloud deployment:** the plan says it is out of scope, but a deployment
   plan was written on 2026-11-15 (branch `docs/deployment-plan`, Cloud Run +
   Vercel + Supabase). It stays a document unless you say otherwise.
4. **Register** is part of the Phase 1 contract but was never built.
5. **Commands:** `--filter web` does not match the package name
   (`inbox-zero-ai`).

## Risks

- Leaked Supabase password on a public repository (above).
- Scope: Phases 7, 10 and 11 are large and are never cut; on a two-day budget
  the features in section 11 of the plan are the ones to cut.
- Plaintext email bodies in `CategorizeClassification.bodyText` until Phase 11.
- Docker Desktop shut down uncleanly today; Postgres recovered without loss,
  but there is no backup yet.
- Type checking needs a 6 GB heap and crashes when free RAM is low.
