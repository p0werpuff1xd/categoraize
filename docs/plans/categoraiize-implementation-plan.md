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

Use `EmailAccount` as the operational mailbox tenant boundary. Every CategorAIze record must be scoped by `emailAccountId`, while authenticated user authorization and database RLS enforce the broader account boundary.

### 3.2 Reuse existing models

Before adding migrations, compare:

- `CategorizeCategory` with `Category`.
- `CategorizeClassification` with existing classification fields.
- `CategorizeDeadlineAlert` with scheduling and reminder models.
- `ClassificationFeedback` with the PRD's Rocchio feedback requirements.

Only add new models or fields where existing models cannot represent the required behavior.

### 3.3 Separate original and adaptive vectors

Each category should retain:

- Original description embedding.
- Adaptive Rocchio centroid.
- Embedding model and version.
- Vector dimension.
- Threshold and active state.
- Feedback metadata.

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

## 5. Four-Phase Delivery Plan

### Phase 1 — Foundation, security, and ingestion

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
