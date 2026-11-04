# CategorAIze Implementation Plan

## 1. Current Repository Baseline

The repository is already a mature Inbox Zero monorepo rather than an empty Next.js scaffold.

Existing foundations include:

- Next.js App Router application in `apps/web`.
- Gmail and Google Calendar integrations.
- Prisma schema and migrations in `apps/web/prisma`.
- Existing categorization, feedback, cleanup, follow-up, draft, and calendar functionality.
- CategorAIze-specific models: `CategorizeCategory`, `CategorizeClassification`, `CategorizeDeadlineAlert`, and `CategorizeNotification`.
- Existing `ClassificationFeedback` and `Category` models that should be evaluated before introducing overlapping replacements.
- Existing worker application in `apps/worker`.
- Existing smart-category and settings routes.

The PRD describes Next.js 14 and React 18, but the repository currently uses newer versions. The implementation should follow the installed repository conventions rather than downgrading the stack.

The main new architectural addition is the Python intelligence service. No `fastapi_core/` package currently exists, so it should be introduced as a dedicated service.

## 1.1 Repository Audit and Fit Assessment

The audit found that the repository already contains substantial infrastructure for the PRD. CategorAIze should be implemented as an extension of the current Inbox Zero application, not as a parallel mail application.

### Existing functionality to reuse

| PRD capability | Existing repository surface | Implementation decision |
|---|---|---|
| Gmail authorization and account connection | `apps/web/utils/gmail/oauth.ts`, `apps/web/utils/gmail/scopes.ts`, Google linking routes, Better Auth account handling | Extend existing OAuth and scope management; do not create a second Gmail OAuth flow. |
| Gmail message ingestion | `apps/web/utils/gmail/sync-messages.ts`, `mailbox-sync.ts`, `message.ts`, `message-bodies.ts`, Google history/webhook processing | Insert the CategorAIze processing step after normalized message retrieval and before classification persistence. |
| Gmail retry and quota handling | `apps/web/utils/gmail/retry.ts` and provider retry utilities | Reuse the existing retry abstraction and add CategorAIze-specific job retry/idempotency rather than duplicating retry code. |
| HTML/body normalization | `apps/web/utils/email/local-mail-sync.ts` and Gmail message-body utilities | Reuse existing HTML-to-text parsing, then add a dedicated PII scrubber before intelligence processing. |
| Labels and mailbox mutations | `apps/web/utils/gmail/label.ts`, `label-validation.ts`, `reply.ts`, and email provider abstractions | Use `EmailProvider` and existing label/draft operations for confirmed user actions. |
| User categories | `Category`, `Newsletter`, `Rule`, existing smart-category pages and `utils/actions/categorize.ts` | Keep sender/category behavior intact; introduce semantic email categories through the CategorAIze model after deciding whether a controlled migration to one category model is practical. |
| Existing AI categorization | `utils/ai/categorize-sender`, `utils/decision-model/categorize-sender`, and sender categorization routes | Retain this as sender-level categorization and do not reuse it as the email-level semantic classifier. |
| Cleanup tools | cleanup routes, bulk unsubscribe UI, `Newsletter`, `GroupItem`, and cleanup Playwright tests | Preserve existing behavior and route CategorAIze labels/priorities around it. |
| Follow-up nudges | `utils/follow-up`, `ThreadTracker`, follow-up routes and tests | Reuse for the PRD's 72-hour follow-up capability. |
| Drafting | `utils/ai/reply/draft-reply.ts`, follow-up draft utilities, Gmail draft routes and actions | Add contextual inputs and human review controls to the existing draft pipeline. |
| Calendar context | `utils/calendar`, `unified-availability.ts`, Google and Microsoft providers, `CalendarConnection` | Reuse unified availability and account timezone resolution. Calendar should be optional and neutral when unavailable. |
| Background jobs | BullMQ worker in `apps/worker`, automation and digest queues | Add a dedicated CategorAIze processing queue and internal API route rather than creating a separate Node polling daemon. |
| Testing | Vitest, DB tests, integration tests, Google emulators, Playwright emulation, AI regression tests | Add co-located algorithm/NLP tests, DB isolation tests, integration fixtures, and browser specs using existing harnesses. |

### Existing CategorAIze groundwork

The repository already includes the `20261014000000_categoraize_pgvector` migration and four CategorAIze models in `apps/web/prisma/schema.prisma`:

- `CategorizeCategory`
- `CategorizeClassification`
- `CategorizeDeadlineAlert`
- `CategorizeNotification`

The migration enables pgvector, creates 384-dimensional vector columns, and adds HNSW indexes. It is useful groundwork, but it is not yet a complete implementation of the PRD.

### Gaps identified by the audit

1. No FastAPI service, Python package, intelligence-service client, or model-serving lifecycle currently exists.
2. No application code currently references the CategorAIze models outside the schema and migration, so routes, actions, jobs, and UI still need to be built.
3. `CategorizeCategory` currently stores only `centroidEmbedding`; it needs a separate original description embedding, model/version metadata, threshold, and adaptive-vector update policy.
4. `CategorizeClassification` has a single `priority` enum and scalar `urgency`/`importance` fields, but does not yet store the PRD's normalized score, deadline factor, sender factor, calendar factor, dampener, or explicit override metadata.
5. `CategorizeDeadlineAlert.dueDate` is not sufficient for uncertain or unconfirmed dates. The schema needs extraction confidence, timezone, ambiguity/review status, source text, and confirmation metadata.
6. The current schema does not contain an explicit semantic email body/snippet field or a PII-scrubbed processing boundary for CategorAIze. Existing email data and classification records must be handled deliberately to avoid sending raw content to FastAPI.
7. The pgvector HNSW indexes are not tenant-aware by themselves. Queries must filter by `emailAccountId` before or together with vector ranking; RLS policies are not present in the migration.
8. The existing Gmail scope list is broader and different from the PRD's exact four-scope statement. Scope compatibility must be resolved without breaking existing product features, and the PRD's scope limitation should be treated as a CategorAIze consent profile rather than blindly replacing global scopes.
9. OAuth token encryption exists through the repository's encryption utilities, but the PRD's specific `MASTER_KEY_FERNET`/Fernet requirement and field-level AES-256-GCM policy are not yet demonstrated for all relevant token and email fields.
10. The repository supports Google and Microsoft mail/calendar providers. The first CategorAIze vertical slice should be Gmail-focused, while shared interfaces should avoid making the FastAPI contract provider-specific.
11. Existing search is provider/mail-engine search, not pgvector semantic search. Semantic search needs a new server-side query path with metadata filters and tenant-safe SQL.
12. Existing AI drafting already supports calendar-aware context and provider drafts, but the PRD's bilingual Taglish tone adaptation and intent chips are not yet integrated.

### Repository-fit conclusion

The safest implementation path is:

1. Reuse existing Gmail, provider, calendar, draft, cleanup, follow-up, worker, authentication, logging, and test infrastructure.
2. Add FastAPI only for preprocessing, embeddings, extraction, and the three academic algorithms.
3. Keep all user authorization, tenant selection, database writes, Gmail mutations, and confirmation flows in Next.js.
4. Treat the existing CategorAIze migration as a starting point requiring follow-up migrations for correctness, auditability, RLS, and review states.
5. Keep sender categorization separate from per-email semantic classification.

### Initial implementation status

The first implementation slice is now scaffolded in `fastapi_core/`:

- `pyproject.toml` defines the Python 3.11–3.14 service and optional NLP/ML dependencies.
- `app/main.py` provides `/healthz` and the versioned `/api/v1/classify` endpoint.
- `app/algorithms/cosine_similarity.py` implements ranking and threshold evaluation.
- `app/algorithms/priority_scoring.py` implements normalized weighted scoring and P1–P5 mapping.
- `app/algorithms/rocchio.py` implements normalized adaptive centroid updates.
- `app/nlp/preprocessing.py` provides conservative English/Taglish normalization and language-state detection.
- `app/nlp/extraction.py` provides bounded relative/explicit deadline and instruction extraction with review flags.
- `app/schemas.py` defines the validated classification request/response contract, including NLP and priority output.
- `app/main.py` now composes classification, NLP extraction, and explainable priority scoring in one response.
- `app/services/embeddings.py` adds lazy loading of `paraphrase-multilingual-MiniLM-L12-v2` with strict 384-dimensional output validation.
- `app/main.py` exposes `/api/v1/embed`; model dependencies are loaded only when inference is requested.
- `app/main.py` protects `/api/v1/embed` and `/api/v1/classify` with the optional `NLP_SERVICE_TOKEN`, while leaving `/healthz` available for uptime monitoring.
- `app/main.py` now exposes authenticated `/api/v1/feedback` for validated Rocchio centroid updates using the PRD's initial alpha/beta values.
- `fastapi_core/README.md` documents local setup, optional ML dependencies, service authentication, endpoint usage, and data-boundary responsibilities.
- `apps/web/lib/categorai/intelligence-client.ts` provides a server-only, response-validated Next.js client for FastAPI.
- `apps/web/app/api/categorai/classify/route.ts` provides the first authenticated Next.js-to-FastAPI boundary, scoped by the existing `withEmailAccount` middleware.
- `apps/web/utils/categorai/pii-scrubber.ts` masks configured Philippine PII and payment-number patterns before service requests.
- `apps/web/utils/categorai/pii-scrubber.test.ts` covers mobile, financial, identifier, and ordinary-text cases.
- `apps/web/prisma/schema.prisma` now separates original category embeddings from adaptive centroids and stores processing, priority-factor, override, and deadline-review metadata.
- `apps/web/prisma/migrations/20261027000000_categoraize_processing_metadata/migration.sql` adds the corresponding forward-only database migration.
- `apps/web/utils/actions/categoraiize.ts` and its validation module provide tenant-scoped category create, update, and delete actions using the new `CategorizeCategory` model.
- `apps/web/app/api/categorai/categories/route.ts` provides a tenant-scoped category read endpoint and deliberately excludes stored vector data from the response.
- `apps/web/lib/categorai/intelligence-client.ts` now centralizes both classification and batch embedding calls with shared auth, timeout, PII scrubbing, and response validation.
- `apps/web/app/api/categorai/process/route.ts` adds the first internal background-processing boundary and idempotently upserts classification, priority-factor, language, and instruction results.
- The processing route now persists extracted deadline alerts, refreshes unfinished alerts on retry, and preserves completed alerts.
- `apps/web/utils/categorai/processing-queue.ts` adds a typed, deduplicated background-job helper for CategorAIze processing.
- `apps/worker/src/runtime.mjs` registers the `categoraiize-processing` BullMQ queue with bounded concurrency.
- `apps/web/app/api/categorai/embed-category/route.ts` materializes a category's original embedding and initializes its adaptive centroid without overwriting existing Rocchio state.
- Category create/update actions now enqueue deduplicated embedding regeneration jobs, and the worker registers `categoraiize-category-embedding` with concurrency 1.
- `apps/web/app/api/categorai/feedback/route.ts` now applies validated Rocchio updates to tenant-scoped adaptive centroids while preserving original embeddings.
- `apps/web/app/api/categorai/search/route.ts` adds tenant-filtered pgvector search with category, priority, deadline, limit, and offset filters.
- Semantic search now accepts natural-language `query` input and obtains its embedding through the intelligence service; precomputed `queryVector` remains supported for internal callers.
- `apps/web/app/api/categorai/classifications/route.ts` adds the inbox triage read path with priority, category, review-state, and pagination filters.
- `fastapi_core/app/nlp/summarizer.py` adds extractive summaries of up to two original salient sentences, now persisted through the processing route.
- Added `priorityBand` persistence so the PRD's P1–P5 result is retained separately from the existing four-level application priority enum; search and inbox reads now expose the band.
- `apps/web/app/api/categorai/task-sheet/route.ts` adds the Smart Task Sheet data endpoint combining unfinished deadlines and unreviewed action directives.
- `apps/web/utils/actions/categoraiize-deadlines.ts` adds tenant-scoped deadline confirmation, completion, and dismissal actions.
- `apps/web/utils/actions/categoraiize-classification.ts` adds tenant-scoped prediction acceptance/correction actions and review state persistence.
- Classification corrections can now optionally invoke Rocchio through the intelligence client and persist returned adaptive centroids with version increments.
- `tests/test_algorithms.py` and `tests/test_nlp.py` contain the first algorithm and NLP regression tests.

This slice intentionally does not yet load the transformer, access Prisma, or process Gmail data. Those concerns will be added after the contract and algorithm behavior are stabilized.

## 2. Target Architecture

```text
Gmail / Google Calendar
          |
          v
Next.js application and worker
          |
          +-- OAuth, token vault, ingestion, sanitization
          +-- Prisma persistence and tenant authorization
          +-- Server actions and authenticated UI routes
          +-- Intelligence-service client
                    |
                    v
             FastAPI service
          +-- Taglish preprocessing
          +-- Language detection
          +-- Embeddings
          +-- Cosine classification
          +-- Deadline/instruction extraction
          +-- Priority scoring
          +-- Rocchio adaptation
                    |
                    v
             Supabase PostgreSQL
          +-- Encrypted email fields
          +-- Category and centroid data
          +-- pgvector embeddings
          +-- RLS policies
          +-- Feedback and audit records
```

The Next.js layer remains responsible for authentication, authorization, Gmail mutations, persistence orchestration, UI, and user confirmation. FastAPI remains responsible for deterministic NLP and algorithmic intelligence.

## 3. Core Design Decisions

### 3.1 Tenant boundary

Use `EmailAccount` as the operational mailbox tenant boundary. Every CategorAIze record must be scoped by `emailAccountId`, while authenticated user authorization and database RLS enforce the broader account boundary. Existing API routes use account-scoped authorization patterns that should be copied into the new CategorAIze routes.

### 3.2 Reuse existing models

The audit confirms that the repository has two category concepts with different meanings:

- `Category` is already used by sender/newsletter categorization and rules.
- `CategorizeCategory` is intended for semantic email classification and vector centroids.

They should remain separate initially, with explicit naming and adapters where the UI needs to display both. Before adding migrations, compare:

- `CategorizeCategory` with `Category`.
- `CategorizeClassification` with existing classification fields.
- `CategorizeDeadlineAlert` with scheduling and reminder models.
- `ClassificationFeedback` with the PRD's Rocchio feedback requirements.

Only add new models or fields where existing models cannot represent the required behavior.

### 3.3 Separate original and adaptive vectors

Each `CategorizeCategory` should retain:

- Original description embedding.
- Adaptive Rocchio centroid.
- Embedding model and version.
- Vector dimension.
- Threshold and active state.
- Feedback metadata.

The existing `centroidEmbedding` column should be retained as the adaptive centroid, while a new column should store the original description embedding.

Rocchio updates must never overwrite the original description embedding.

### 3.4 Explainability

Persist classification similarity, threshold, ranked matches, language metadata, model version, priority factors, normalized weights, dampening, and whether a user/VIP override was applied.

## 4. Proposed Structure

```text
fastapi_core/
  pyproject.toml
  app/
    main.py
    config.py
    api/
      classify.py
      extract.py
      priority.py
      feedback.py
      health.py
    schemas/
    algorithms/
      cosine_similarity.py
      priority_scoring.py
      rocchio.py
    nlp/
      preprocessing.py
      taglish_normalizer.py
      language_detection.py
      embeddings.py
      deadline_extractor.py
      instruction_extractor.py
      summarizer.py
    services/
    tests/
```

Suggested Next.js additions:

```text
apps/web/
  lib/categorai/
    intelligence-client.ts
    classification.ts
    priority.ts
    extraction.ts
    feedback.ts
    encryption.ts
    tenant-context.ts
  app/api/categorai/
    classify/
    categories/
    feedback/
    search/
    tasks/
    drafts/
    account/
  components/categorai/
```

## 4.1 Audit-Driven Integration Work

### Next.js integration points

Add the CategorAIze orchestration layer around these existing surfaces:

- `apps/web/utils/gmail/sync-messages.ts` and Google history processing: enqueue or execute idempotent CategorAIze processing after message normalization.
- `apps/web/utils/email/provider.ts` and `EmailProvider`: keep provider-neutral Gmail mutations behind the existing abstraction.
- `apps/web/utils/actions`: use server actions for category management, review, confirmation, feedback, deadline status changes, and erasure controls.
- `apps/web/app/api`: use authenticated routes for FastAPI callbacks, semantic search, task-sheet queries, and worker endpoints.
- `apps/web/utils/calendar/unified-availability.ts`: provide optional calendar context to priority scoring and drafting.
- `apps/web/utils/ai/reply/draft-reply.ts` and Gmail draft utilities: add explicit CategorAIze context without bypassing existing draft safeguards.
- `apps/web/utils/categorize/senders`: leave sender-level categorization intact and avoid coupling it to email-level vector classification.
- `apps/web/__tests__/integration`, `apps/web/__tests__/db`, and `apps/web/__tests__/playwright`: extend the existing test harness instead of creating a parallel test setup.

### Required schema follow-up

Create follow-up migrations after validating the existing pgvector migration:

1. Add original category description embedding, embedding/model version, threshold, active state, and adaptive centroid version.
2. Add priority factor columns for urgency, deadline, sender, calendar, raw score, normalized score, dampener, and override metadata.
3. Add deadline extraction source text, confidence, timezone, ambiguity/review status, confirmation timestamp, and completion metadata.
4. Add classification processing status, error/retry metadata, preprocessing version, and idempotency key.
5. Add feedback records or extend `ClassificationFeedback` so corrections contain the email vector reference, corrected category, incorrect category, and Rocchio update event.
6. Add tenant-safe indexes that match the actual query predicates, especially `emailAccountId` plus priority/deadline/category filters.
7. Add RLS policies and transaction helpers; the existing Prisma foreign keys and indexes do not provide database-level tenant isolation.
8. Add encrypted-field storage only after defining the migration strategy for existing plaintext data and the operational key-rotation policy.

### FastAPI-to-Next.js boundary

FastAPI must receive only sanitized, minimum-necessary payloads. It should not receive OAuth tokens, database credentials, raw attachments, or unredacted PII. Next.js should authenticate service calls, validate response schemas, enforce account ownership, and perform all persistence.

The first service integration should be classification-only. Extraction, priority, feedback, and semantic search should be added behind versioned contracts so a FastAPI failure cannot interrupt Gmail sync or user mailbox access.

### Queue and failure model

Use the existing BullMQ worker forwarding pattern for background processing:

```text
Gmail sync/history event
        -> CategorAIze processing job
        -> authenticated Next.js internal route
        -> FastAPI request
        -> validated response
        -> tenant-scoped Prisma transaction
```

Processing must be retry-safe. A failed classification should be visible as a retryable processing state and must not cause duplicate classifications, duplicate notifications, duplicate Rocchio updates, or repeated Gmail mutations.

### Scope and provider strategy

The PRD's first release is Gmail-focused. The repository supports Microsoft mail and calendars, so the implementation should:

- use Gmail as the first supported intelligence ingestion path;
- keep classification payloads provider-neutral;
- reuse the existing `EmailProvider` interface for mailbox operations;
- use unified calendar availability where available;
- explicitly mark Microsoft support as follow-up scope unless equivalent ingestion guarantees are implemented.

### Security audit actions

Before release, audit all existing token-bearing models and access paths, including `Account`, `CalendarConnection`, `DriveConnection`, `MessagingChannel`, and other integrations. The PRD's encryption requirement cannot be considered complete if only Gmail tokens or only newly created fields are protected.

Also verify that:

- new FastAPI logs never contain message bodies, tokens, or PII;
- worker payloads contain references or scrubbed content only;
- database query helpers require an authenticated account context;
- semantic vector queries include tenant filters;
- account deletion removes CategorAIze rows, vectors, queues, notifications, and derived artifacts.

## 5. Four-Phase Delivery Plan

### Phase 1 — Foundation, security, and ingestion

- Completed initial FastAPI service scaffold and deterministic algorithm modules in `fastapi_core/`.
- Completed initial classification contract and health endpoint.
- Audit Gmail OAuth, sync, persistence, smart categories, cleanup, follow-up, drafts, calendar, and deletion flows.
- Decide ownership between overlapping category and classification models.
- Scaffold the FastAPI service and `/healthz` endpoint.
- Define versioned API contracts, environment variables, secrets, and deployment configuration.
- Confirm Gmail scopes, PKCE handling, consent, and reconnect behavior.
- Encrypt OAuth access and refresh tokens using the configured master key.
- Normalize Gmail messages and strip HTML, CSS, tracking pixels, base64 content, and attachments.
- Implement PII masking for Philippine mobile numbers, credit cards, SSS, PhilHealth, and TIN formats.
- Implement five-minute polling, idempotency, bounded retries, and exponential backoff for 429 responses.
- Reconcile schema fields for categories, vectors, classifications, extractions, priority, and feedback.
- Enable pgvector and validate 384-dimensional vectors.
- Implement AES-256-GCM field encryption, transaction-scoped tenant context, RLS policies, token revocation, and cascading account purge.

**Exit criteria:** a Gmail message can be safely ingested, sanitized, PII-masked, encrypted, and persisted with verified tenant isolation.

### Phase 2 — Bilingual intelligence and algorithmic core

- Implement conservative English/Taglish normalization while preserving negation, urgency, and deadline cues.
- Detect English, Filipino, Taglish/mixed, and unknown language states.
- Integrate `paraphrase-multilingual-MiniLM-L12-v2` with model versioning and 384-dimensional validation.
- Add fixtures for English, Taglish, code-switched technical text, negation, and ambiguous messages.
- Implement cosine similarity with thresholding, ranking, zero-vector safeguards, and `UNCATEGORIZED` results.
- Implement normalized weighted priority scoring with urgency, deadline, sender, calendar, dampening, and factor breakdowns.
- Implement Rocchio feedback with `alpha = 0.20`, `beta = 0.15`, L2 normalization, duplicate protection, and original-embedding preservation.
- Implement bilingual deadline extraction, relative-date resolution, timezone handling, ambiguity states, instruction extraction, and two-sentence extractive summaries.
- Connect the processing pipeline:

```text
sanitize -> preprocess -> embed -> classify -> suggest label if unmatched
-> extract deadline/instruction/summary -> score priority -> persist
```

- Add idempotent processing keys, model-version handling, and partial-failure recovery.

**Exit criteria:** all five PRD acceptance scenarios pass at the service level, and an ingested email produces classification, priority, summary, actions, and reviewable deadlines.

### Phase 3 — Product workflows and user experience

- Build `/inbox` with three-pane priority triage, P1–P5 badges, categories, confidence, factor breakdown, actions, and deadlines.
- Build `/rules` category management and live classification sandbox.
- Add category editing, deletion, activation, threshold configuration, embedding regeneration, and duplicate-label checks.
- Implement confirmation-based suggested labels and predicted-label correction flows.
- Apply the Editorial Paper & Cream design tokens through the existing Tailwind/shadcn system.
- Implement semantic search with pgvector and metadata filter chaining.
- Build Smart Task Sheet for unhandled actions, approaching deadlines, and date review.
- Add explicit Google Calendar export confirmation.
- Preserve and restyle `/cleanup` while retaining unsubscribe and cold-outreach behavior.
- Build `/contacts` sender roles, importance weights, and VIP configuration.
- Add `/settings` integration scopes, calendar controls, PII/encryption status, JSON export, and erasure controls.
- Assemble contextual drafts from actions, sender relationship, calendar availability, language, and thread context.
- Add English and professional Taglish drafting, tone chips, editing before Gmail Drafts creation, and explicit send confirmation.
- Regression-test bulk unsubscribe, cold outreach blocking, follow-up nudges, label mutations, and existing draft behavior.

**Exit criteria:** a user can inspect, classify, correct, search, task-manage, configure sender context, generate drafts, and explicitly send through Gmail.

### Phase 4 — Verification, performance, and release

- Run functional, security, integration, browser, and performance tests.
- Measure classification latency over 100 messages.
- Benchmark vector search, encryption overhead, UI transitions, and warm/cold inference.
- Verify RLS with mismatched users and accounts.
- Test Gmail ingestion recovery, category editing, feedback transactions, search, account purge, draft creation, and Calendar export.
- Inspect browser screenshots for all browser-facing UI changes.
- Verify the five PRD acceptance scenarios end to end.
- Deploy FastAPI with model caching, health monitoring, and uptime checks.
- Prepare secrets, migration, rollback, deletion, and incident runbooks.
- Complete algorithm documentation, complexity analysis, traceability matrix, performance report, and known-limitations list.

**Exit criteria:** the release candidate has evidence-backed functional, security, performance, and operational results.

## 6. API Contracts

### `POST /api/v1/classify`

The request should include a sanitized email, timezone, active category representations, and classification options such as threshold and ranked-match inclusion.

The response should include:

- Selected category and similarity.
- Threshold and classification status.
- Ranked similarity distribution.
- Language and confidence.
- Summary, instructions, and deadlines.
- Priority level, score, factors, normalized weights, and dampener.
- Model name and version.

### `POST /api/v1/feedback`

Accept the email vector or persisted email reference, incorrect category, corrected category, tenant/account context, and a unique feedback event identifier. Return duplicate status, updated centroid metadata, vector version, and audit identifier.

### `POST /api/v1/search`

Accept query text, category filter, minimum priority, deadline filter, and pagination cursor. The Next.js layer must enforce authorization and tenant scoping.

## 7. Testing Strategy

### Algorithm tests

- Cosine: identical, orthogonal, negative, zero-vector, threshold, ambiguous, and below-threshold cases.
- Priority: all factor boundaries, P1–P5 boundaries, normalized weights, missing calendar data, imminent deadlines, and dampening.
- Rocchio: movement toward corrected vectors, movement away from incorrect vectors, normalization, zero-vector protection, duplicate feedback, and preserved original embeddings.

### NLP tests

- English, Filipino, Taglish, code switching, `bukas`, `sa Biyernes`, explicit dates, ambiguous dates, negation, quoted messages, summaries, and PII masking.

### Integration tests

- Gmail ingestion and 429 recovery.
- Classification persistence.
- Category editing and re-embedding.
- Feedback transactions.
- Semantic search and filters.
- Account purge.
- Gmail draft creation.
- Calendar export.

### Browser tests

Cover `/inbox`, `/rules`, category confirmation, category correction, `/cleanup`, `/contacts`, `/settings`, Smart Task Sheet, and assisted drafting.

Before changing visible controls, search `apps/web/__tests__/playwright` for the existing affordance name.

## 8. Non-Functional Verification

| PRD target | Verification |
|---|---|
| Classification under 4.5 seconds | Measure 100 end-to-end messages, including persistence |
| UI transitions under 150 ms | Chrome DevTools performance traces |
| Search under 45 ms | Benchmark vector search at representative volume |
| Zero tenant leakage | Automated RLS tests with mismatched context |
| Encryption overhead under 15 ms | Compare encrypted and plaintext record operations |
| Service uptime at least 99.5% | Monitor `/healthz` every five minutes |

These values are targets to measure, not established results.

## 9. Key Risks and Mitigations

### Existing model overlap

Decide model ownership in Week 1 and avoid maintaining competing category systems.

### Python service latency

Preload the model, keep the service warm, batch safe operations, and measure cold versus warm inference separately.

### RLS and connection pooling

Set context inside every transaction with `SET LOCAL`, test concurrent pooled access, and prohibit unscoped tenant helpers.

### Encryption and search

Search through embeddings and intentionally indexed metadata rather than encrypted body fields.

### Deadline false positives

Persist confidence and ambiguity, require confirmation for ambiguous dates, and do not treat any date as automatically urgent.

### Privacy leakage in logs

Log identifiers and metrics only, redact request bodies, and use trace-level logging for sensitive metadata.

## 10. Definition of Done

- Gmail OAuth uses the approved scopes and PKCE.
- Tokens are encrypted and never logged in plaintext.
- Ingestion strips HTML, attachments, tracking content, and configured PII.
- Tenant isolation is enforced in application authorization and database RLS.
- Categorization uses multilingual embeddings and cosine similarity.
- Suggested labels require explicit confirmation.
- Priority scoring uses normalized weights and exposes factor explanations.
- Rocchio updates adaptive centroids without overwriting original embeddings.
- English and Taglish deadlines and instructions are reviewable.
- Semantic search supports vector matching and metadata filters.
- Smart Task Sheet and Calendar export work.
- Draft generation never sends autonomously.
- Existing cleanup and follow-up functionality remains functional.
- The five PRD acceptance scenarios pass.
- Security, integration, browser, and performance results are documented.
- Deployment, rollback, deletion, and operational procedures are documented.

## 11. Current implementation checkpoint — 28 October 2026

The repository now contains the first end-to-end backend slice: the FastAPI intelligence service, multilingual preprocessing and extraction, embeddings, priority scoring, PII scrubbing, authenticated classification and search routes, tenant-scoped category actions, deadline review actions, Rocchio feedback, queue definitions, Prisma persistence metadata, and the Smart Task Sheet read contract.

The remaining delivery work is intentionally explicit rather than being treated as complete:

- connect Gmail ingestion to the categorization queue;
- add the `/inbox`, `/rules`, and Smart Task Sheet UI flows;
- connect confirmed deadlines to the existing calendar event writer;
- add integration/browser coverage and run the environment-dependent test suite;
- verify production migrations, RLS behavior, latency targets, deletion behavior, and rollback procedures.

Validation completed at this checkpoint: Prisma schema validation/generation, Python compilation and smoke checks, worker syntax validation, and Biome validation for the new TypeScript surface. Full Python tests remain pending because the local environment does not currently have `pytest` installed.
