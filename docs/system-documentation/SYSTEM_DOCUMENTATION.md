# CategorAIze: Section 3.9 and Back Matter

This file replaces the earlier draft of Section 3.9 and the back matter. Every number below was taken
from a file in the repository on 2026-11-21 (branch `main`, commit `4fe30dcae`) or from the deployed
system on that date, and each table names its source. Items still open are marked **[OPEN]** with the
reason. Figures are in `figures/` (PNG at print resolution, plus SVG or HTML sources).

What changed from the earlier draft, in short: the Bi-LSTM-CRF tagger is trained and running (v6),
the evaluation harness, frozen test split, results and agreement study are all committed, integration,
end-to-end and load tests were run, and the production NLP service is `fastapi_core` (the older
`services/nlp` prototype is not deployed). The completion figures were recomputed accordingly.

---

## 3.9 Project Development Progress

### 3.9.1 Completed System Components

| # | Component | Status | Evidence in repository |
|---|---|---|---|
| 1 | Multilingual SBERT embedding service (`paraphrase-multilingual-MiniLM-L12-v2`, 384-d) | Complete, deployed | `fastapi_core/app/services/embeddings.py:12` |
| 2 | Category ranking by cosine similarity, threshold τ = 0.35 | Complete, deployed | `fastapi_core/app/algorithms/classifier.py`, `fastapi_core/app/schemas.py:69` |
| 3 | Language identification (en, tl, mixed) and Taglish normalizer | Complete, deployed | `fastapi_core/app/nlp/language.py`, `fastapi_core/app/nlp/taglish_cleaner.py` |
| 4 | Bi-LSTM-CRF TASK/DATE tagger (word + character-CNN + casing, BIO, CRF/Viterbi), model v6 | Complete, deployed | `fastapi_core/app/algorithms/sequence_tagger.py`, `fastapi_core/models/tagger/v6/`, `fastapi_core/models/tagger/current.json` |
| 5 | Date normalizer and resolver (Asia/Manila, ambiguous flag) | Complete, deployed | `fastapi_core/app/nlp/date_codes.py` |
| 6 | Priority P1–P5: learned model v1 with rule fallback and guardrails (VIP floor P4, promotions cap) | Complete, deployed | `fastapi_core/app/ml/priority_model.py`, `fastapi_core/app/ml/priority_rules.py:13`, `fastapi_core/models/priority/v1/` |
| 7 | Register (tone) detection: formal, neutral, casual | Complete, deployed (rules; learned model kept but not used) | `fastapi_core/app/nlp/register.py` |
| 8 | Calendar conflict detection (busy periods, start inclusive, end exclusive) | Complete, deployed | `fastapi_core/app/nlp/date_codes.py`, `apps/web/utils/categoraize/calendar-busy.ts` |
| 9 | Rocchio feedback (α = 0.20, β = 0.15) | Complete, deployed | `fastapi_core/app/algorithms/feedback.py:25`, `POST /api/v1/feedback` |
| 10 | Suggested labels and category discovery (curated label library; agglomerative clustering on vectors) | Complete | `fastapi_core/app/algorithms/label_library.py`, `fastapi_core/app/main.py:397` (`POST /api/v1/discover`), `apps/web/utils/categoraize/discovery.ts` |
| 11 | Web app: Priority Inbox, Task Sheet, Label Studio, contacts and VIP, priority override and rating | Complete, deployed | `apps/web/app/(app)/[emailAccountId]/categoraize/` |
| 12 | PII masking (Philippine phone, government IDs, cards) | Complete, deployed | `fastapi_core/app/nlp/pii.py`, `apps/web/utils/categoraize/pii.ts` |
| 13 | Field-level encryption (AES-256-GCM, HKDF per-column keys, key id `p1`) | Complete, verified at rest in production | `apps/web/utils/categoraize/field-encryption.ts`, `apps/web/utils/categoraize/field-encryption-extension.ts` |
| 14 | Row-level security with a non-bypass runtime role | Complete, verified in production | `apps/web/utils/categoraize/tenant.ts`, `scripts/db/test-rls.sql` |
| 15 | Consent gate, data export, account erasure, audit log | Complete, deployed | `apps/web/utils/categoraize/consent.ts`, `data-export.ts`, `audit.ts`, `apps/web/utils/user/delete.ts` |
| 16 | Encrypted 3-2-1 backup and restore test | Complete (off-site copy missing, see 3.9.3) | `scripts/backup/backup.ps1`, `scripts/backup/restore-test.ps1` |
| 17 | Gmail and Outlook OAuth, sync, calendars, Drive/OneDrive | Inherited from Inbox Zero; Microsoft sign-in enabled in production on 2026-11-20 | `apps/web/`, `apps/web/utils/outlook/`, `apps/web/utils/gmail/` |
| 18 | Passive-Aggressive per-user classifier | Prototype only, not deployed | `services/nlp/app/pa.py` |

**Summary:** 17 of 18 components are complete; 15 of them run in production
(`categoraize` web revision 00034 and `categoraize-nlp` revision 00006 on Google Cloud Run). Component 18
belongs to the earlier `services/nlp` prototype and was superseded by Rocchio feedback in component 9.

**Verified on 2026-11-21:**
- `fastapi_core` unit and component tests: 359 passed, 7 expected failures tied to open defects
  D-01 to D-03; line coverage 95.0%.
- Web unit tests for the CategorAIze areas: 789 passed (108 files).
- Production API suite: 72 passed, 3 expected failures tied to open defects SYS-D02, SYS-D03 and SYS-D08.

### 3.9.2 Software Completion Percentage

Completion is counted over the 17 planned activities: the 12 recorded build phases and the 5
verification activities. A complete activity counts 1; a partial one counts the fraction executed.
There is no Phase 9 record in the repository (the deployment work of that period is in Phase 8).

| Track | Activities | Done | Credit |
|---|---|---|---|
| Build | Phases 0–8, 10, 11, 12 (all merged into `main`) | 12 of 12 | 12.0 |
| Verification | Component testing (312 cases) | Complete | 1.0 |
| | Model evaluation, B1–B4 on the frozen test split | Complete | 1.0 |
| | Inter-annotator agreement (second labeler) | Complete | 1.0 |
| | System testing: 32 of 61 steps executed (29 blocked: no test accounts) | Partial | 0.52 |
| | Usability testing (SUS, SEQ) | Not started | 0.0 |
| **Total** | | | **15.5 of 17 = 91%** |

**Build completion = 12 / 12 = 100%. Verification completion = 3.52 / 5 = 70%. Overall = 91%.**
Figure 22 charts this table (`scripts/docs/make_charts.py` holds the activity list).

**Recommended wording for the manuscript:** *"All twelve planned build phases are complete and deployed.
Verification is 70% complete: unit and component testing, the B1–B4 model evaluation and the
inter-annotator agreement study are done; system testing has executed 32 of 61 steps, and usability
testing has not started. Overall, 15.5 of 17 planned activities (91%) are complete."*

Each activity is weighted equally. If the team weights activities by effort, change the weights in
`scripts/docs/make_charts.py` and regenerate Figure 22.

### 3.9.3 Remaining Development and Testing Activities

**Development**

| # | Activity | Status | Notes |
|---|---|---|---|
| D1 | Apply the tuned category settings in the deployed service | **Open** | The tuned keyword weight 0.3 and sender-role weight 0.02 (`fastapi_core/config/tuned.json`) exist only in the evaluation harness (`fastapi_core/eval/systems.py`). The deployed `/api/v1/classify` ranks by description embeddings or learned centroids only, so a new user's results are closer to B2 than B3/B4 until corrections build centroids (Figure 16 shows one Filipino email left uncategorized). |
| D2 | Retire or document `services/nlp` | Open | Prototype with `/analyze` and Passive-Aggressive; not deployed. Production is `fastapi_core`. |
| D3 | Improve zero-shot category descriptions for Filipino | Open | Defect D-03: 5 of 24 component fixtures misranked, 4 of them Filipino. |
| D4 | Off-site backup copy | Open | Defect SYS-D07: both backup copies are on local disks. |
| D5 | NLP capacity under load | Open | Defect SYS-D06: p95 6.6 s at 50 concurrent users (max 2 instances). |
| D6 | Hide API docs in production; tighten CSP; drop `X-Powered-By` | Open | Defects SYS-D02, SYS-D08, SYS-D03. |
| D7 | Configure `REDIS_URL` in production | Open | Live inbox updates (mail stream) need a Redis TCP URL. |
| D8 | Remove the upstream Inbox Zero documentation links | Open | Defect SYS-D04 (not-found page, help link, user menu). |
| D9 | Native Filipino speaker review of the test labels | Open | Second labeler done (kappa in Table 10); native review pending. |

**Testing and evaluation**

| # | Activity | Status | Notes |
|---|---|---|---|
| T1 | Create one Google and one Microsoft test account | **Open (owner)** | Blocks 29 system-test steps and Figure 17 (Figures 13–15 and 18 were captured on the emulated stack). |
| T2 | Rerun the system suite with test accounts | Pending T1 | `scripts/testing/run-system-tests.ps1` |
| T3 | Usability test with participants (SUS and SEQ) | Not started | Questionnaire in Appendix D.5. |
| T4 | Re-measure load after D5 | Pending D5 | `fastapi_core/system_tests/load/locustfile.py` |

---

## List of Figures

| Figure | Title | File (in `figures/`) | Status |
|---|---|---|---|
| 1 | CategorAIze Overall System Architecture | `fig01-architecture.png` (`src/fig01-architecture.mmd`) | Done |
| 2 | CategorAIze System Workflow | `fig02-workflow.png` | Done |
| 3 | Use Case Diagram | `fig03-use-case.png` (from `docs/categoraize-use-case-diagram.svg`) | Done |
| 4 | Data Flow Diagram (Level 1) | `fig04-dfd.png` | Done |
| 5 | Entity Relationship Diagram (CategorAIze tables) | `fig05-erd.png` (generated from `apps/web/prisma/schema.prisma`) | Done |
| 6 | Email Collection and Annotation Workflow | `fig06-annotation.png` | Done |
| 7 | AI Model Processing Pipeline | `fig07-pipeline.png` | Done |
| 8 | SBERT Email Categorization Workflow | `fig08-sbert.png` | Done |
| 9 | Bi-LSTM-CRF TASK and DATE Extraction Workflow | `fig09-bilstm.png` | Done (labels: `TASK`/`DATE`) |
| 10 | Rocchio User Feedback and Adaptation Workflow | `fig10-rocchio.png` | Done |
| 11 | Calendar Conflict Detection Workflow | `fig11-calendar.png` | Done |
| 12 | Login and Authentication Interface | `fig12b-login.png` (also `fig12a-landing`, `fig12c-login-options`, `fig12d-privacy-notice`, `fig12e-login-mobile` from production, and `fig12f-consent.png` from the emulated stack) | Done |
| 13 | Main Inbox (Priority Inbox) Interface | `fig13-priority-inbox.png` | Done (emulated Google mailbox, 45 synthetic bilingual seeded emails (`apps/web/__tests__/playwright/emulated/docs/documentation-screenshots.spec.ts`)) |
| 14 | Email Category and Priority Labels | `fig14-category-priority-labels.png` (P4+ filter) | Done (same source) |
| 15 | Email Detail View with Extracted Spans (`TASK`/`DATE`) | `fig15-email-detail-spans.png` (Taglish), `fig15c-email-detail-filipino.png`, `fig15b-task-sheet.png` | Done (same source) |
| 16 | Multilingual Email Categorization Example | `fig16-multilingual-examples.png` | Done (production NLP, synthetic emails) |
| 17 | Calendar Conflict Notification | — | **[OPEN]** The calendar was connected in the emulated stack, but no seeded deadline was registered as overlapping a busy period, so no conflict badge appeared. Figure 15 shows the calendar factor and its explanation instead. |
| 18 | Category Management Interface (Label Studio) | `fig18-label-studio.png` (suggested labels and the label list were still loading; the Sandbox and sections are shown); contacts and VIP: `fig18b-contacts-vip.png` | Done; retake once for a fully loaded view |
| 19 | FastAPI `/api/v1/classify` Endpoint Response | `fig19-api-response.png` | Done (production NLP, synthetic email) |
| 20 | B1–B4 Model Evaluation Results | `fig20-b1-b4-results.png` | Done |
| 21 | Inter-Annotator Agreement Results | `fig21-inter-annotator-agreement.png` | Done |
| 22 | Software Development Completion Summary | `fig22-completion-summary.png` | Done |

Figure 19 uses `/api/v1/classify`, the production endpoint. The earlier outline named `/analyze`,
which exists only in the undeployed `services/nlp` prototype.

**Captions to use**

- **Figure 16.** The deployed NLP service on three synthetic emails in the new-user setting (category
  descriptions only, no learned centroids). The English and Taglish emails are categorized correctly;
  the Filipino email ranks `school` first but below τ = 0.35, so it stays uncategorized. All three
  receive TASK and DATE spans.
- **Figure 19.** Response of `POST /api/v1/classify` (HTTP 200, 1.1 s) for a synthetic Taglish request.
  The top similarity (0.296) is below τ, so `category` is `null`; the email still receives a P5 priority
  with its reasons (sender role, task present, deadline proximity), a calendar conflict boost and four
  spans. The 384-number embedding is shortened.
- **Figure 20.** Scores of B1 (rules), B2 (SBERT zero-shot), B3 (SBERT tuned) and B4 (B3 + Bi-LSTM-CRF
  + learned priority) on the frozen test split (n = 100), with 95% bootstrap confidence intervals.
  Overlapping intervals mean a difference is not established.
- **Figure 21.** Agreement between the team's second labeler and the gold labels on the test set,
  with Landis and Koch reference bands.

---

## List of Tables

| Table | Title | Section | Status |
|---|---|---|---|
| 1 | Comparison of Existing Email Management Systems | 2.11 | **[OPEN]** needs the cited systems from Chapter 2 |
| 2 | Development Tools and Technologies | 3.1.3 | Complete |
| 3 | Functional Requirements | 3.1 | Complete (below) |
| 4 | Non-Functional Requirements | 3.1 | Complete (below) |
| 5 | Dataset Description and Sources | 3.3.1 | Complete (below) |
| 6 | Email Category Definitions | 3.3.2 | Complete (below) |
| 7 | Dataset Label Distribution | 3.3.5 | Complete (below) |
| 8 | Dataset Training, Validation, and Testing Distribution | 3.3.6 | Complete (below) |
| 9 | Email Annotation Guidelines | 3.3.4 | Complete (below) |
| 10 | Inter-Annotator Agreement Results | 3.6.8 | Complete (below) |
| 11 | AI Models and Algorithm Configurations | 3.4 | Complete (below) |
| 12 | Model Evaluation Metrics | 3.6.2 | Complete (below) |
| 13 | B1–B4 Evaluation Results | 3.6.7 | Complete (below) |
| 14 | Comparative Model Performance by Language | 3.6.7 | Complete (below) |
| 15 | Unit and Integration Test Results | 3.7 | Complete (below) |
| 16 | End-to-End and Load Testing Results | 3.7.3–3.7.4 | Complete (below) |
| 17 | User Usability Testing Plan (SUS and SEQ) | 3.7.5 | Plan complete; testing not started |
| 18 | System Component Completion Status | 3.9.1 | Complete (above) |
| 19 | Remaining Development and Testing Activities | 3.9.3 | Complete (above) |

### Table 3. Functional Requirements

Source: *CategorAIze Master Product Requirements Document (PRD)*, V7, Section 4. Status checked against
the repository and production on 2026-11-21.

| ID | Requirement | Status |
|---|---|---|
| FR-1.1 | OAuth 2.0 sign-in with restricted scopes | Built (Google and Microsoft); scopes match `docs/oauth-scope-review.md` |
| FR-1.2 | AES-256-GCM encrypted OAuth tokens | Built; verified encrypted at rest in production |
| FR-1.3 | Automatic token refresh, re-authentication prompt | Inherited, built |
| FR-1.4 | Sanitized ingestion (plain text, attachments discarded) | Built |
| FR-1.5 | Real-time delivery (Pub/Sub) with backoff | Built (inherited Gmail watch) |
| FR-1.6, FR-1.7 | Inbox Zero tools and feature parity | Inherited; not re-verified with a test account (T1) |
| FR-2.1 | PII masking before classification | Built (`pii.py`, `pii.ts`) |
| FR-2.2 | Encryption of stored email fields | Built; 826 encrypted values, 0 plaintext in production |
| FR-2.3 | Row-level security with a non-bypass role | Built; forced RLS on all 14 CategorAIze tables |
| FR-2.4 | Account erasure and cascading purge | Built; erasure test passes on all 13 per-user tables |
| FR-3.1, FR-3.2 | Taglish preprocessing and language identification | Built |
| FR-3.3 | Multilingual SBERT embeddings (Algorithm 1) | Built |
| FR-3.4 | User-defined categories | Built (Label Studio) |
| FR-3.5 | Zero-shot assignment with τ = 0.35 | Built |
| FR-3.6 | Suggested new labels from a curated library | Built |
| FR-3.7 | Classification review feeding Rocchio | Built |
| FR-4.1 | Extractive summary | Built (`summarizer.py`) |
| FR-4.2 | Bi-LSTM-CRF TASK/DATE tagging (Algorithm 2) | Built; v6 deployed |
| FR-4.3, FR-4.4, FR-4.5 | Deadline resolution, instruction extraction, display | Built |
| FR-4.6 | Training data and span evaluation | Built; Table 13 |
| FR-5.1 | Rule-based priority | Built; kept as fallback behind the learned model v1 |
| FR-5.2 | Rocchio feedback (Algorithm 3) | Built |
| FR-5.3 | End-to-end flow | Built (Figure 2) |
| FR-5.4 to FR-5.7 | Priority triage UI, explanation, override, configuration | Built |
| FR-6.1 to FR-6.4 | Assisted drafting through OpenRouter, human review | Inherited and gated by opt-in consent; not verified with a test account |
| FR-7.1, FR-7.2 | Semantic search with filters | Built |
| FR-7.3 | Smart Task Sheet | Built |

### Table 4. Non-Functional Requirements

Source: PRD V7, NFR table. Measured values from `docs/testing/`.

| ID | Requirement | Target | Measured | Result |
|---|---|---|---|---|
| NFR-1 | End-to-end classification latency | ≤ 4.5 s per email | NLP `/classify` p50 0.49 s, p95 1.00 s (50 sequential calls, warm) | Met for the NLP step; full ingest-to-database not measured (needs T1) |
| NFR-2 | UI state transition speed | ≤ 150 ms | Not measured | **[OPEN]** |
| NFR-3 | Category matching step | ≤ 45 ms | Not measured separately | **[OPEN]** |
| NFR-4 | Tenancy isolation | Zero data leakage | RLS tests: 14 of 14 pass (local); production config verified | Met |
| NFR-5 | Encryption overhead | ≤ 15 ms per record | Component test asserts < 15 ms per record (5 fields, 5 KB body) | Met |
| NFR-6 | Service readiness | ≥ 99.5% uptime | NLP min-instances 1, `/health` 200; uptime monitor not set up | **[OPEN]** |
| NFR-7 | Sequence tagging latency | Set after baseline | Included in the `/classify` latency above | Baseline recorded |
| (system test) | Load: 50 users for 5 minutes | ≤ 1% errors, p95 ≤ 2 s | 0% errors; p95 6.6 s | Errors met; p95 not met (SYS-D06) |

### Table 5. Dataset Description and Sources

| Split | File | Emails | Source | Use |
|---|---|---:|---|---|
| Train | `fastapi_core/data/categoraize-dataset/data/train.jsonl` | 300 | Template-synthetic, team-authored templates | Rocchio centroids, learned models |
| Dev | `.../data/dev.jsonl` | 30 | Hand-written by the team | Every tuning choice |
| Test | `.../data/test.jsonl` | 100 | Hand-written by the team | Final evaluation only |

No real user mail is used for training, tuning or evaluation (Google API Limited Use). The tagger was
additionally trained on a larger synthetic span corpus (see `fastapi_core/models/tagger/v6/metrics.json`).

### Table 6. Email Category Definitions

Source: `fastapi_core/data/categoraize-dataset/data/categories.json`.

| Slug | Name | Description |
|---|---|---|
| work_tasks | Work | Work requests, task assignments, deliverables, project updates, and code or report reviews from colleagues, managers or clients. |
| meetings | Meetings | Meeting invitations, rescheduling, availability requests, and coordination of calls, appointments and get-togethers with colleagues or vendors. |
| school | School | Classes, assignments, exams, deadlines, grades, enrollment and messages from instructors, classmates or the school office. |
| job_search | Job Search | Job applications, interview invitations, recruiter messages, assessments, job offers, requirements and job alerts. |
| finance_billing | Finance and Billing | Bills, invoices, payments, receipts, refunds, subscriptions and expense reports. |
| promotions | Promotions and Newsletters | Marketing offers, sales, discounts, abandoned carts, newsletters, webinars and referral programs from companies. |
| alerts | Alerts and Notifications | Automated notifications: security sign-in alerts, delivery updates, system and server alerts, storage and account notices. |
| personal | Personal | Messages from family and friends: invitations, plans, photos, reunions and casual conversation. |


### Table 7. Dataset Label Distribution

| Category | Train | Dev | Test |
|---|---:|---:|---:|
| work_tasks | 42 | 6 | 14 |
| meetings | 42 | 5 | 12 |
| school | 36 | 4 | 13 |
| job_search | 36 | 3 | 9 |
| finance_billing | 36 | 3 | 13 |
| promotions | 36 | 3 | 13 |
| alerts | 36 | 3 | 12 |
| personal | 36 | 3 | 14 |
| **Total** | **300** | **30** | **100** |

| Priority | Train | Dev | Test |
|---|---:|---:|---:|
| P1 | 36 | 3 | 11 |
| P2 | 84 | 5 | 27 |
| P3 | 72 | 5 | 25 |
| P4 | 84 | 15 | 29 |
| P5 | 24 | 2 | 8 |

Test priorities include the three gold corrections from 3 to 2 made after adjudication
(`fastapi_core/data/categoraize-dataset/review/adjudication_log.md`).

### Table 8. Dataset Training, Validation, and Testing Distribution

| Split | English | Taglish (mixed) | Filipino | Total |
|---|---:|---:|---:|---:|
| Train | 100 | 100 | 100 | 300 |
| Dev (validation) | 10 | 10 | 10 | 30 |
| Test | 34 | 33 | 33 | 100 |

The test split is frozen: `fastapi_core/data/categoraize-dataset/data/test.jsonl` (SHA-256 recorded in
`docs/testing/system/results/eval-reproduction.json`).

### Table 9. Email Annotation Guidelines (summary)

Full text: `fastapi_core/data/categoraize-dataset/LABELING_GUIDELINE.md` (v1.0).

| Field | Rule |
|---|---|
| Category | Exactly one of the 8 slugs; choose what the email is mainly about. |
| Priority | 1 to 5 from the recipient's point of view (urgency, required action, sender role, deadline). |
| Register | The sender's tone: formal, neutral or casual. |
| Spans | `TASK` = the action the recipient must take; `DATE` = a deadline or time expression; BIO tags; Filipino affixes stay on the token; `mag-`/`pa-` prefixes are left out of spans. |
| Calendar conflict | Computed from the resolved deadline and busy periods, not labeled. |
| Language | `en`, `tl` or `mixed`. |

### Table 10. Inter-Annotator Agreement Results

Source: `fastapi_core/eval/results/human_review.json` (computed by `fastapi_core/eval/human_review.py`),
test set, n = 100, 95% bootstrap confidence intervals, measured before adjudication.

| Label | Statistic | Value | 95% CI | Raw agreement |
|---|---|---:|---|---:|
| Category | Cohen's κ | 0.81 | 0.72–0.87 | 83% |
| Priority | Weighted κ | 0.75 | 0.68–0.81 | 36% exact, 96% within one level |
| Register | Cohen's κ | 0.46 | 0.30–0.61 | 67% |

Interpretation (Landis and Koch): almost perfect for category, substantial for priority, moderate for
register. Gold labels are AI-authored; describe them as AI-authored with measured team agreement.

### Table 11. AI Models and Algorithm Configurations

| Component | Setting | Value | Location |
|---|---|---|---|
| SBERT | Model | `paraphrase-multilingual-MiniLM-L12-v2`, 384-d | `fastapi_core/app/services/embeddings.py:12` |
| Categorization | Threshold τ | 0.35 | `fastapi_core/app/schemas.py:69` |
| Categorization (evaluated B3/B4 only) | Keyword weight, role weight | 0.3, 0.02 | `fastapi_core/config/tuned.json` (not applied in production, see D1) |
| Rocchio (production) | α, β | 0.20, 0.15 | `fastapi_core/app/algorithms/feedback.py:25-26`, `schemas.py:274-275` |
| Rocchio (evaluation bootstrap) | α, β | 1.0, 4.0 | `fastapi_core/config/tuned.json` |
| Bi-LSTM-CRF v6 | Word / char / char filters / casing / hidden / dropout | 100 / 30 / 50 / 4 / 128 / 0.5 | `fastapi_core/models/tagger/v6/metrics.json` |
| Bi-LSTM-CRF v6 | Training | 5,000 synthetic emails, 12 epochs, 2 LLM paraphrase copies; dev F1 0.873 | same file |
| Priority | Levels, VIP floor | 1–5, VIP + task at least P4 | `fastapi_core/app/ml/priority_rules.py:11-13` |
| Priority | Learned model | Logistic regression v1, top-3 reasons | `fastapi_core/models/priority/v1/` |
| Register | Method | Rule cues (learned model kept, not used) | `fastapi_core/app/nlp/register.py` |
| Input limit | Body length | 50,000 characters | `fastapi_core/app/schemas.py:64` |
| Prototype (not deployed) | `PA_MIN_EXAMPLES`, `NLP_MAX_TEXT_CHARS` | 2, 12,000 | `services/nlp/app/config.py:22-23` |

### Table 12. Model Evaluation Metrics

| Task | Metric | Meaning |
|---|---|---|
| Category | Accuracy, macro-F1 | Share correct; F1 averaged over the 8 categories equally |
| Priority | Exact, within one level, QWK, MAE | Ordinal agreement with the gold level |
| Register | Accuracy, macro-F1 | Tone label agreement |
| Spans | TASK F1, DATE F1, micro-F1 | Exact span match, entity level |
| Dates | Resolved-date accuracy (end to end; on gold spans) | Correct instant after normalization |
| Calendar | Conflict accuracy | Correct conflict / no-conflict decision |
| All | 95% bootstrap CI | 1,000 resamples of emails, fixed seed |

### Table 13. B1–B4 Evaluation Results (test split, all languages, n = 100)

Source: `fastapi_core/eval/RESULTS.md` (generated from `fastapi_core/eval/results/B*_test.json`). These
are the numbers after the adjudication re-run; the B4 run was reproduced exactly on 2026-11-20
(292 metrics, 0 differences, `docs/testing/system/results/eval-reproduction.json`).

| Metric | B1 | B2 | B3 | B4 |
|---|---|---|---|---|
| Category macro-F1 | 0.725 [0.625, 0.796] | 0.284 [0.180, 0.366] | 0.770 [0.681, 0.841] | 0.770 [0.681, 0.841] |
| Category accuracy | 0.680 [0.580, 0.770] | 0.190 [0.120, 0.270] | 0.770 [0.680, 0.850] | 0.770 [0.680, 0.850] |
| Priority exact | 0.360 [0.270, 0.450] | 0.340 [0.250, 0.430] | 0.370 [0.280, 0.460] | 0.420 [0.330, 0.520] |
| Priority within 1 | 0.870 [0.800, 0.930] | 0.810 [0.740, 0.880] | 0.880 [0.810, 0.930] | 0.870 [0.800, 0.930] |
| Priority QWK | 0.532 [0.365, 0.660] | 0.385 [0.219, 0.526] | 0.542 [0.366, 0.672] | 0.544 [0.385, 0.663] |
| Priority MAE (lower is better) | 0.800 [0.660, 0.950] | 0.880 [0.740, 1.030] | 0.780 [0.640, 0.920] | 0.720 [0.580, 0.860] |
| Register accuracy | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] | 0.850 [0.780, 0.910] |
| Register macro-F1 | 0.846 [0.766, 0.910] | 0.846 [0.766, 0.910] | 0.846 [0.766, 0.910] | 0.846 [0.766, 0.910] |
| TASK span F1 | 0.383 [0.250, 0.520] | 0.383 [0.250, 0.520] | 0.383 [0.250, 0.520] | 0.356 [0.264, 0.452] |
| DATE span F1 | 0.462 [0.345, 0.575] | 0.462 [0.345, 0.575] | 0.462 [0.345, 0.575] | 0.459 [0.351, 0.560] |
| Span micro-F1 | 0.430 [0.353, 0.513] | 0.430 [0.353, 0.513] | 0.430 [0.353, 0.513] | 0.408 [0.339, 0.476] |
| Resolved-date accuracy (end to end) | 0.471 [0.357, 0.594] | 0.471 [0.357, 0.594] | 0.471 [0.357, 0.594] | 0.543 [0.426, 0.657] |
| Resolved-date accuracy (on gold spans) | 0.957 [0.903, 1.000] | 0.957 [0.903, 1.000] | 0.957 [0.903, 1.000] | 0.957 [0.903, 1.000] |
| Calendar-conflict accuracy | 0.990 [0.970, 1.000] | 0.990 [0.970, 1.000] | 0.990 [0.970, 1.000] | 1.000 [1.000, 1.000] |

Systems: B1 keyword rules + regex + rule priority; B2 SBERT zero-shot; B3 SBERT tuned (keywords, role,
Rocchio bootstrap); B4 = B3 + Bi-LSTM-CRF v6 + learned priority v1. B1–B3 share the regex tagger, so their
span and date rows are identical. On span F1 the Bi-LSTM-CRF does not beat the regex baseline on this
hand-written test set (its synthetic-dev F1 is 0.99), which the manuscript should report as a limitation.

### Table 14. Comparative Model Performance by Language (test split)

Source: `fastapi_core/eval/results/B*_test.json`, `results.<language>`.

| Language (n) | System | Category macro-F1 | Priority QWK | Span micro-F1 | Register accuracy |
|---|---|---:|---:|---:|---:|
| English (34) | B1 | 0.765 | 0.505 | 0.471 | 0.824 |
| | B2 | 0.456 | 0.405 | 0.471 | 0.824 |
| | B3 | 0.806 | 0.505 | 0.471 | 0.824 |
| | B4 | 0.806 | 0.569 | 0.491 | 0.824 |
| Taglish (33) | B1 | 0.726 | 0.540 | 0.427 | 0.909 |
| | B2 | 0.208 | 0.342 | 0.427 | 0.909 |
| | B3 | 0.785 | 0.577 | 0.427 | 0.909 |
| | B4 | 0.785 | 0.601 | 0.429 | 0.909 |
| Filipino (33) | B1 | 0.684 | 0.553 | 0.390 | 0.818 |
| | B2 | 0.083 | 0.396 | 0.390 | 0.818 |
| | B3 | 0.722 | 0.550 | 0.390 | 0.818 |
| | B4 | 0.722 | 0.464 | 0.313 | 0.818 |

Per-language confidence intervals are in `RESULTS.md`; with about 33 emails per language they are wide.

### Table 15. Unit and Integration Test Results

| Suite | Scope | Result | Source |
|---|---|---|---|
| NLP unit and component tests | `fastapi_core/tests` (incl. C1–C10 components) | 359 passed, 7 expected failures (open defects D-01 to D-03); line coverage 95.0% | `docs/testing/component_tests.md`, `docs/testing/coverage/nlp/` |
| Component report (all 12 components) | NLP, web logic, IAS database checks | 312 cases: 305 passed, 0 failed, 7 expected failures | `docs/testing/component_tests.md`, `docs/testing/traceability.csv` |
| Web unit tests | CategorAIze areas of `apps/web` | 789 passed (108 files); new web logic coverage 93.2% | Vitest run of 2026-11-21 |
| Database security (local, rolled back) | RLS, erasure, restore | RLS 14/14, erasure 6/6, restore 5/5 | `docs/testing/results/db-*.txt` |
| Integration: web build to NLP service | 50 test-split emails through the deployed `/classify`, compared with the in-repo model | 50/50 identical (category, priority, spans, language) | `docs/testing/system_tests.md` S3 |
| Integration: production database | Encryption at rest, RLS configuration, token encryption | 4/4 checks pass (read-only) | `docs/testing/system/results/prod-db-checks.txt` |

Defects found and fixed during testing are listed in `docs/testing/defects.md` (D-01 to D-05) and the
system defect log in `docs/testing/system_tests.md` (SYS-D01 to SYS-D08).

### Table 16. End-to-End and Load Testing Results

Source: `docs/testing/system_tests.md` (61 steps across 15 scenarios, production, 2026-11-20/21).

| Item | Result |
|---|---|
| System test steps | 27 passed, 5 failed (known, non-blocking defects), 29 blocked (no test accounts) |
| Playwright end-to-end (public pages) | Landing, sign-in (Google and Microsoft), redirects, links, 404, 390 px mobile, keyboard-only: pass |
| Lighthouse | Accessibility 100 on `/login` and `/privacy` |
| Load test | 50 users × 5 minutes, 2,602 requests: 0% errors; p50 2.1 s, p95 6.6 s, p99 63 s; 8.7 req/s |
| Sequential latency | 50 `/classify` calls: p50 0.49 s, p95 1.00 s |
| Security | 11/11 endpoints reject missing or wrong key; headers present; scopes match the review; no secrets in git history; 0 tokens or bodies in 20,000 log entries |
| Backup and recovery | Encrypted backup to two copies; restore from copy 2 in 149 s (RTO target 4 h); RPO 24 h |
| Go/no-go | No open blocking defect; mailbox scenarios need test accounts (T1) |

### Table 17. User Usability Testing Plan (SUS and SEQ)

| Item | Plan |
|---|---|
| Participants | Proposed: 5–8 target users (students and young professionals who read English, Filipino or Taglish mail) |
| Accounts | Test accounts with synthetic mail only (no personal inboxes) |
| Tasks | (1) Sign in and accept the Terms; (2) find the most urgent email in the Priority Inbox; (3) open an email and check its extracted task and deadline; (4) correct a wrong category; (5) override a priority; (6) create a new label in Label Studio; (7) open the Task Sheet |
| After each task | SEQ: one 7-point question (Appendix D.5) |
| After the session | SUS: 10 items, 5-point scale (Appendix D.5) |
| Scoring | SUS: odd items score − 1, even items 5 − score, sum × 2.5 (0–100; 68 is the commonly cited average). SEQ: mean per task |
| Status | Not started (T3) |

---

## References

Use only sources the team has read. Verify each citation's details against the original before
submission.

**Academic journals and research papers (2021–2026)**
- **[OPEN]** Fill from the Chapter 2 **[REF]** slots.

**Foundational algorithm references**
- Rocchio, J. J. (1971). Relevance feedback in information retrieval. In G. Salton (Ed.), *The SMART
  Retrieval System: Experiments in Automatic Document Processing* (pp. 313–323). Prentice-Hall.
- Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence embeddings using Siamese BERT-networks.
  *Proceedings of EMNLP-IJCNLP 2019*, 3982–3992.
- Reimers, N., & Gurevych, I. (2020). Making monolingual sentence embeddings multilingual using knowledge
  distillation. *Proceedings of EMNLP 2020*, 4512–4525. (Source of the multilingual MiniLM model family.)
- Huang, Z., Xu, W., & Yu, K. (2015). Bidirectional LSTM-CRF models for sequence tagging. arXiv:1508.01991.
- Ma, X., & Hovy, E. (2016). End-to-end sequence labeling via bi-directional LSTM-CNNs-CRF. *Proceedings
  of ACL 2016*, 1064–1074. (Character-CNN representation used by the tagger.)
- Lafferty, J., McCallum, A., & Pereira, F. (2001). Conditional random fields: Probabilistic models for
  segmenting and labeling sequence data. *Proceedings of ICML 2001*, 282–289.
- Cohen, J. (1960). A coefficient of agreement for nominal scales. *Educational and Psychological
  Measurement, 20*(1), 37–46.
- Cohen, J. (1968). Weighted kappa: Nominal scale agreement with provision for scaled disagreement or
  partial credit. *Psychological Bulletin, 70*(4), 213–220.
- Landis, J. R., & Koch, G. G. (1977). The measurement of observer agreement for categorical data.
  *Biometrics, 33*(1), 159–174.
- Efron, B., & Tibshirani, R. J. (1993). *An Introduction to the Bootstrap*. Chapman & Hall.
- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*
  (pp. 189–194). Taylor & Francis.
- Sauro, J., & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires.
  *Proceedings of CHI 2009*, 1599–1608.
- Crammer, K., Dekel, O., Keshet, J., Shalev-Shwartz, S., & Singer, Y. (2006). Online passive-aggressive
  algorithms. *Journal of Machine Learning Research, 7*, 551–585. (Only if the prototype is discussed.)

**Technical documentation** (add access dates when citing)
- Next.js documentation; Prisma ORM documentation; FastAPI documentation; sentence-transformers model card
  for `paraphrase-multilingual-MiniLM-L12-v2`; Google Gmail API and the Google API Services User Data
  Policy (Limited Use); Microsoft Graph API; Supabase (PostgreSQL row-level security); Google Cloud Run;
  pgvector.

**Dataset sources**
- The team's synthetic and hand-written dataset (`fastapi_core/data/categoraize-dataset/`). No external
  corpus is used.

**Philippine data privacy laws and regulations**
- Republic Act No. 10173, Data Privacy Act of 2012.
- National Privacy Commission (2016). Implementing Rules and Regulations of Republic Act No. 10173.
- **[OPEN]** Add any NPC circulars or advisories the team relied on (for example on security of personal
  data or breach management).

---

## Appendices

### Appendix A — System Screenshots

Screenshots come only from the running application with synthetic data; no real email content.

| Section | Figure | Status |
|---|---|---|
| A.1 Login and Authentication | Figure 12 (`fig12a`–`fig12e`) | Done (production public pages) |
| A.2 Main Inbox (Priority Inbox) | Figure 13 | Done (emulated mailbox, synthetic data) |
| A.3 Email Details and Extracted Spans | Figure 15 | Done (emulated mailbox, synthetic data) |
| A.4 Multilingual Email Classification | Figure 16 | Done (production NLP) |
| A.5 Calendar Conflict Detection | Figure 17 | **[OPEN]** see the List of Figures |
| A.6 Category Management (Label Studio) | Figure 18 | Done (emulated mailbox, synthetic data) |

Figures 13–15 and 18 were captured from the in-repo emulated stack: an emulated Google mailbox (`demo.user@example.com`), a local NLP service and the 45 synthetic bilingual seed emails, with no real account or mail involved. To capture Figure 17 with a real account later: sign in with the test account,
seed the 45 synthetic bilingual emails with `pnpm categoraize:seed -- --email <test account>` (from
`apps/web`, see `apps/web/scripts/categoraize-seed.ts`), add one calendar event that overlaps a seeded
deadline, then capture the Priority Inbox, one email's detail pane, the Task Sheet and Label Studio.

### Appendix B — AI Model and Evaluation Evidence

| Section | Content | Location |
|---|---|---|
| B.1 B1–B4 Evaluation Results | Table 13 and Table 14 | `fastapi_core/eval/RESULTS.md`, `fastapi_core/eval/results/` |
| B.2 Model Configuration | Table 11 (each value with file and line) | as listed in Table 11 |
| B.3 FastAPI Sample JSON | Request and response of `POST /api/v1/classify` on production, synthetic Taglish email | `appendix/b3-classify-request.json`, `appendix/b3-classify-response.json`, Figure 19 |
| B.4 Inter-Annotator Agreement Output | κ, weighted κ, CIs, per-language scopes | `fastapi_core/eval/results/human_review.json` (script `fastapi_core/eval/human_review.py`) |
| B.5 Sample Dataset Records | One per language (below) | `fastapi_core/data/categoraize-dataset/data/dev.jsonl` |

**B.5 Sample records (dev split, synthetic, unchanged).**

```json
{"id": "dev-en-001", "language": "en", "subject": "Client call prep", "body": "Hi Alex, the client call is Thursday at 11 AM. Prepare a one-page summary of the open issues and share it by Wednesday night. Thanks, Marco", "sender_role": "Manager", "is_vip": false, "gold_category": "work_tasks", "gold_priority": 4, "gold_register": "neutral", "gold_spans": [{"label": "DATE", "text": "Thursday at 11 AM"}, {"label": "TASK", "text": "Prepare a one-page summary of the open issues"}, {"label": "DATE", "text": "Wednesday night"}]}
{"id": "dev-mixed-001", "language": "mixed", "subject": "Contract review", "body": "Alex, pa-review ng revised contract bago mag-noon bukas. Kailangan ma-sign ni legal.", "sender_role": "Director/Executive", "is_vip": true, "gold_category": "work_tasks", "gold_priority": 5, "gold_register": "neutral", "gold_spans": [{"label": "TASK", "text": "review ng revised contract"}, {"label": "DATE", "text": "noon bukas"}]}
{"id": "dev-tl-001", "language": "tl", "subject": "Ulat sa linggong ito", "body": "Alex, pakipadala ang lingguhang ulat bago mag-alas-singko ng hapon ngayon. Salamat.", "sender_role": "Manager", "is_vip": false, "gold_category": "work_tasks", "gold_priority": 5, "gold_register": "neutral", "gold_spans": [{"label": "TASK", "text": "pakipadala ang lingguhang ulat"}, {"label": "DATE", "text": "alas-singko ng hapon ngayon"}]}
```

Span offsets and resolved dates are omitted here for space; they are in the source file.

### Appendix C — Supporting Source Code

All paths are relative to the repository root.

| Item | Path | Status |
|---|---|---|
| C.1 Repository | `https://github.com/p0werpuff1xd/categoraize` (fork of Inbox Zero) | Available |
| C.2 Agreement (kappa) script | `fastapi_core/eval/human_review.py` (the outline's `scripts/kappa.py` does not exist; cite this file) | Available |
| C.3 Category definitions | `fastapi_core/data/categoraize-dataset/data/categories.json` | Available |
| C.4 Evaluation results | `fastapi_core/eval/RESULTS.md` | Available |
| C.5 Second-labeler sheet | `fastapi_core/data/categoraize-dataset/review/second_labeler_test_FILLED.csv` | Available |
| C.6 Frozen test split | `fastapi_core/data/categoraize-dataset/data/test.jsonl` | Available |
| C.7 Labeling guideline | `fastapi_core/data/categoraize-dataset/LABELING_GUIDELINE.md` | Available |
| C.8 Adjudication log | `fastapi_core/data/categoraize-dataset/review/adjudication_log.md` | Available |
| C.9 Figure and chart generators | `scripts/docs/` (`make_charts.py`, `sample_api_response.py`, `multilingual_examples.py`, `render_api_figures.py`, `public_screenshots.cjs`, `html2png.cjs`), diagram sources `docs/system-documentation/figures/src/` | Available |

### Appendix D — Software Testing Documentation

| Section | Content | Location |
|---|---|---|
| D.1 Unit Test Results | Table 15 | `docs/testing/component_tests.md`, `docs/testing/TEST_PLAN.md`, `docs/testing/coverage/` |
| D.2 Integration Test Results | Table 15 (integration rows) | `docs/testing/system_tests.md` (S3, S10) |
| D.3 End-to-End Testing | Plan and results, Table 16 | `docs/testing/system_tests.md`, `apps/web/__tests__/system/` (`pnpm test:e2e`) |
| D.4 Load Testing | Plan and results, Table 16 | `fastapi_core/system_tests/load/locustfile.py`, `docs/testing/system/results/load_stats.csv` |
| D.5 User Testing Questionnaire | Below | — |

**D.5 Single Ease Question (after each task)**

*Overall, how difficult or easy was the task to complete?* 1 = Very difficult … 7 = Very easy.

**D.5 System Usability Scale (after the session)** — 1 = Strongly disagree … 5 = Strongly agree.

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

(Brooke, 1996. Many studies replace "cumbersome" with "awkward" for non-native English speakers; record
which wording was used.)

### Appendix E — Project Progress Documentation

**E.1 Software Completion Summary.** Section 3.9.2: build 100% (12 of 12 phases), verification 70%,
overall 91% (15.5 of 17 activities). Chart: Figure 22.

**E.2 Completed Features**

- Multilingual SBERT categorization with τ = 0.35, suggested labels and category discovery.
- Language identification and Taglish normalization for English, Filipino and Taglish.
- Bi-LSTM-CRF TASK/DATE extraction (v6) with deadline resolution in Asia/Manila time.
- Priority P1–P5 with a learned model, rule fallback, guardrails and "why this priority" reasons.
- Register (tone) detection.
- Calendar conflict detection with Google and Outlook calendars.
- Rocchio feedback from category corrections; priority override and rating.
- Priority Inbox, Task Sheet, Label Studio, contacts and VIP management.
- Consent gate, PII masking, AES-256-GCM field encryption, row-level security, audit log, data export,
  account erasure, encrypted backups.
- Inherited Gmail and Outlook sync, calendars and drives, with Microsoft sign-in enabled in production.

**E.3 Pending Features and Testing.** Section 3.9.3 (D1–D9, T1–T4).

**E.4 Future Development Plan**

1. Create the two test accounts (T1), rerun the system suite (T2) and capture Figures 13–15, 17, 18.
2. Apply the tuned category settings in the deployed service (D1) and improve Filipino descriptions (D3).
3. Run the usability study (T3).
4. Raise NLP capacity and re-run the load test (D5, T4); add the off-site backup copy (D4).
5. Close the remaining security findings (D6, D8) and configure `REDIS_URL` (D7).
6. Complete the native Filipino speaker review (D9).

---

## Reconciliation Checklist

| # | Item | Status |
|---|---|---|
| 1 | Choose the production NLP service and align documents | Done: `fastapi_core` is production; `services/nlp` is an undeployed prototype (D2 to retire or document it) |
| 2 | Commit `fastapi_core/data/`; confirm the frozen test file | Done: `data/test.jsonl`, SHA-256 recorded |
| 3 | Re-run the evaluation or mark results as reported | Done: re-run after adjudication; B4 reproduced exactly |
| 4 | Fix the Appendix C file list | Done: every item exists (Appendix C) |
| 5 | Settle `TASK`/`DATE` vs. `ACTION`/`DEADLINE` | Done: `TASK`/`DATE` everywhere (code, dataset, figures, tables) |
| 6 | Register detector and "learned priority" wording | Done: register is rule-based (learned model kept, not used); priority uses learned model v1 with rule fallback, so "learned priority" is accurate for B4 and production |
| 7 | Fill **[REF]** and **[TODO]** items | Open: Chapter 2 references, Table 1, NPC advisories, Figure 17 |
