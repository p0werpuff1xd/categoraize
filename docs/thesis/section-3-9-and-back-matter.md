# CategorAIze: Section 3.9 and Back Matter (draft)

> This file replaces the 3.9 stub in `chapters-1-3.md`. Items marked **[TODO]** need data the repository does not contain. Status was checked against the repository on the drafting date.

---

## 3.9 Project Development Progress

### 3.9.1 Completed System Components

| # | Component | Status | Evidence in repository |
|---|---|---|---|
| 1 | Multilingual SBERT embedding service (384-d) | Complete | `fastapi_core/app/services/embeddings.py` |
| 2 | Category similarity ranking, threshold τ = 0.35 | Complete | `fastapi_core/app/algorithms/cosine_similarity.py`, `fastapi_core/app/schemas.py` |
| 3 | Language tagging (en, tl, taglish) | Complete | `fastapi_core/app/nlp/preprocessing.py` |
| 4 | Rule-based deadline and instruction extraction | Complete | `fastapi_core/app/nlp/extraction.py` |
| 5 | Priority scoring, levels P1–P5 | Complete | `fastapi_core/app/algorithms/priority_scoring.py` |
| 6 | Rocchio centroid feedback endpoint | Complete | `fastapi_core/app/algorithms/rocchio.py`, `POST /api/v1/feedback` |
| 7 | Chatbot NLP tools (`analyzeEmail`, `correctEmailCategory`) | Complete at server tool layer | `apps/web/utils/ai/assistant/nlp-tools.ts` |
| 8 | Typed NLP client | Complete | `apps/web/utils/nlp/client.ts` |
| 9 | Field-level encryption (AES-256-GCM, versioned keys) | Complete | `apps/web/utils/encryption.ts` |
| 10 | `services/nlp` analyze and feedback API | Complete; BiLSTM-CRF returns `unavailable` | `services/nlp/app/main.py`, `services/nlp/app/service.py` |
| 11 | Passive-Aggressive per-user classifier | Partial: model logic implemented, persistence and UI not done | `services/nlp/app/pa.py` |
| 12 | Gmail OAuth, sync, inbox, calendar connections | Complete (inherited from Inbox Zero) | `apps/web/`, `apps/worker/` |

**Summary:** 11 of 12 components are complete or complete with a documented gap. Component 11 is partial. Component 12 is inherited and was not changed by this study.

**Verified:** the `fastapi_core` pytest suite passed on the drafting date (10 passed). The `services/nlp` tests were not run.

### 3.9.2 Software Completion Percentage

Completion is measured two ways. The first is the headline figure because it covers the full planned scope, including work not yet started.

**Method A: Phase completion (headline).** The incremental plan has five phases (`docs/categoraize-nlp-incremental-implementation.md`), each counted equally.

| Phase | Scope | Status | Credit |
|---|---|---|---|
| 1 | FastAPI NLP foundation | Implemented | 1.0 |
| 2 | Chatbot integration (server tools) | Implemented | 1.0 |
| 3 | Passive-Aggressive feedback UI | Planned | 0.0 |
| 4 | Passive-Aggressive persistence (PostgreSQL) | Planned | 0.0 |
| 5 | BiLSTM-CRF annotation and training | Planned | 0.0 |

**Phase completion = 2 / 5 = 40%.**

**Method B: Component completion (supporting).** Using the 12 components in 3.9.1, with complete = 1.0 and partial = 0.5:

**Component completion = (11 × 1.0 + 1 × 0.5) / 12 = 11.5 / 12 = 95.8%.** Eleven components are complete (1–10 and 12, where 12 is inherited) and component 11 (Passive-Aggressive) is partial.

**Why the two figures differ.** Method B measures what has been built, not what the project set out to build. Phases 3–5 contain no listed components yet, so Method B overstates progress. Report Method A as the completion percentage and Method B only as a description of built components.

**Recommended wording for the manuscript:** *"The NLP pipeline is 40% complete by planned phase (2 of 5). The categorization, extraction, priority, and feedback components are implemented, and the `fastapi_core` components are covered by a passing unit-test suite; the trained span model, feedback persistence, and feedback UI remain."*

**[TODO]** Method A counts all phases equally. If the team weights phases by effort, record the weights here and recompute.

### 3.9.3 Remaining Development and Testing Activities

**Development**

| # | Activity | Status | Notes |
|---|---|---|---|
| D1 | Commit `fastapi_core/data/` to version control | Pending | Currently untracked in git |
| D2 | Reconcile `fastapi_core/` and `services/nlp/` into one documented service | Pending | Both expose overlapping endpoints |
| D3 | Phase 3: feedback UI for Passive-Aggressive predictions | Planned | Do not change labels, archive state, or folders automatically |
| D4 | Phase 4: Passive-Aggressive persistence in PostgreSQL | Planned | Per-user scope, model versioning, idempotent feedback |
| D5 | Phase 5: de-identified BIO dataset (`ACTION`, `DEADLINE`) | Planned | Requires approved, de-identified annotations |
| D6 | Phase 5: train, evaluate, and version the BiLSTM-CRF checkpoint | Planned | Until then, the API reports `unavailable` |
| D7 | PII masking module for NLP input | Not started | Currently the Next.js side's responsibility |
| D8 | Register detector: locate or remove | Open | Reported in study, no code found |
| D9 | Rename or justify "learned" priority | Open | Current priority is heuristic |

**Testing and evaluation**

| # | Activity | Status | Notes |
|---|---|---|---|
| T1 | Run `services/nlp` tests (4 tests) | Pending | Not run on drafting date |
| T2 | Integration tests: Next.js client to NLP service | Pending | Not located in repository |
| T3 | Commit evaluation harness, result files, and frozen split | Pending | README states these are absent |
| T4 | Re-run B1–B4 evaluation, or label all results as reported | Pending | Required for Section 3.6 |
| T5 | End-to-end tests of CategorAIze flows | Pending | Playwright scripts exist; no CategorAIze coverage confirmed |
| T6 | Load test of `/api/v1/classify` | Pending | No plan or results in repository |
| T7 | SUS/SEQ usability test with participants | Pending | Questionnaire not in repository |

---

## List of Figures

| Figure | Title | Status | Source or action |
|---|---|---|---|
| 1 | CategorAIze Overall System Architecture | Draft exists | Section 3.2.1 diagram; redraw as image |
| 2 | CategorAIze System Workflow | Draft exists | Section 3.2.2; redraw as image |
| 3 | Use Case Diagram | Available | `docs/categoraize-use-case-diagram.svg` |
| 4 | Data Flow Diagram | **[TODO]** | Create from Section 3.2.2 |
| 5 | Entity Relationship Diagram | **[TODO]** | Generate from `apps/web/prisma/schema.prisma` |
| 6 | Email Collection and Annotation Workflow | **[TODO]** | Create from Section 3.3 |
| 7 | AI Model Processing Pipeline | **[TODO]** | Create from Section 3.4 |
| 8 | SBERT Email Categorization Workflow | **[TODO]** | Create from Section 3.4.1 |
| 9 | Bi-LSTM-CRF TASK and DATE Extraction Workflow | **[TODO]** | Rename labels to match the chosen scheme (see 3.3.4) |
| 10 | Rocchio User Feedback and Adaptation Workflow | **[TODO]** | Create from Section 3.4.5 |
| 11 | Calendar Conflict Detection Workflow | **[TODO]** | Create from Section 3.4.6 |
| 12 | Login and Authentication Interface | **[TODO]** | Screenshot, running app |
| 13 | Main Inbox Interface | **[TODO]** | Screenshot, running app |
| 14 | Email Category and Priority Labels | **[TODO]** | Screenshot, running app |
| 15 | Email Detail View with Extracted Spans | **[TODO]** | Screenshot; label as `DATE`/`TASK` or `DEADLINE`/`ACTION` consistently |
| 16 | Multilingual Email Categorization Example | **[TODO]** | Screenshot or response from a sample Taglish email |
| 17 | Calendar Conflict Notification | **[TODO]** | Screenshot, running app |
| 18 | Category Management Interface | **[TODO]** | Screenshot, running app |
| 19 | FastAPI `/analyze` Endpoint Response | Available in code | Generate from `services/nlp` with a sample request (see B.3) |
| 20 | B1–B4 Model Evaluation Results | **[TODO]** | Chart from re-run results (T4) |
| 21 | Inter-Annotator Agreement Results | **[TODO]** | Chart from the agreement values |
| 22 | Software Development Completion Summary | Data ready | Chart from Section 3.9.2, Method A |

**Note:** Figure 19 is named `/analyze`. That endpoint exists only in `services/nlp`. The `fastapi_core` service uses `/api/v1/classify`.

---

## List of Tables

| Table | Title | Section | Status |
|---|---|---|---|
| 1 | Comparison of Existing Email Management Systems | 2.11 | Draft; needs cited systems |
| 2 | Development Tools and Technologies | 3.1.3 | Complete |
| 3 | Functional Requirements | — | **[TODO]**: not in repository. Derive from the PRD (`D:\categoraize\CategorAIze Master Product Requirements Document (PRD).md`, check it is current) |
| 4 | Non-Functional Requirements | — | **[TODO]**: derive from Sections 3.5.9 and 3.8 |
| 5 | Dataset Description and Sources | 3.3.1 | Draft |
| 6 | Email Category Definitions | 1.1, README | Complete: eight categories with descriptions in README |
| 7 | Dataset Label Distribution | 3.3.5 | Language counts done; category counts **[TODO]** |
| 8 | Dataset Training, Validation, and Testing Distribution | 3.3.6 | Counts done; test-set confirmation pending |
| 9 | Email Annotation Guidelines | 3.3.4 | **[TODO]**: no written guideline in repository |
| 10 | Inter-Annotator Agreement Results | 3.6.8 | Reported values only |
| 11 | AI Models and Algorithm Configurations | 3.4 | Complete: model names, τ, α, β, weights, PA minimum |
| 12 | Model Evaluation Metrics | 3.6.2 | Complete |
| 13 | B1–B4 Evaluation Results | 3.6.7 | Reported values; re-run pending (T4) |
| 14 | Comparative Model Performance | 3.6.7 | Reported; per-language breakdown **[TODO]** |
| 15 | Unit and Integration Test Results | 3.7 | Unit: 10 passed. Integration: **[TODO]** |
| 16 | End-to-End and Load Testing Status | 3.7.3–3.7.4 | Pending |
| 17 | User Usability Testing Plan (SUS and SEQ) | 3.7.5 | Pending |
| 18 | System Component Completion Status | 3.9.1 | Complete |
| 19 | Remaining Development and Testing Activities | 3.9.3 | Complete |

---

## References

Use only sources that the team has read. Required headings and status:

- **Academic Journals and Research Papers (2021–2026):** **[REF]** entries needed. Find them in the Chapter 2 **[REF]** slots.
- **Foundational Algorithm References:** Rocchio (1971); Reimers and Gurevych (2019), Sentence-BERT; Huang, Xu, and Yu (2015), BiLSTM-CRF; Crammer et al. (2006), Passive-Aggressive algorithms. Verify each citation's details before use.
- **Technical Documentation:** Next.js, Prisma, FastAPI, sentence-transformers (model card for `paraphrase-multilingual-MiniLM-L12-v2`), Google Gmail API and Limited Use policy, Supabase. **[TODO]** Add access dates.
- **Dataset Sources:** the team's synthetic and team-written data (no external corpus). **[TODO]** Cite any external corpus if one is used.
- **Philippine Data Privacy Laws and Regulations:** Republic Act No. 10173 (Data Privacy Act of 2012). **[TODO]** Add the National Privacy Commission's implementing rules and advisories the team relied on.

---

## Appendices

### Appendix A — System Screenshots

| Section | Screenshot | Status |
|---|---|---|
| A.1 Login and Authentication | Figure 12 | **[TODO]** |
| A.2 Main Inbox | Figure 13 | **[TODO]** |
| A.3 Email Details and Extracted Spans | Figure 15 | **[TODO]** |
| A.4 Multilingual Email Classification | Figure 16 | **[TODO]** |
| A.5 Calendar Conflict Detection | Figure 17 | **[TODO]** |
| A.6 Category Management | Figure 18 | **[TODO]** |

Screenshots must come from the running application with test accounts or synthetic data only. Do not include real email content or personal data.

### Appendix B — AI Model and Evaluation Evidence

| Section | Content | Status |
|---|---|---|
| B.1 B1–B4 Evaluation Results | Table 13 values | Reported; re-run pending |
| B.2 Model Configuration Files | Config values: τ, α, β, priority weights, `SBERT_MODEL`, `PA_MIN_EXAMPLES`, `NLP_MAX_TEXT_CHARS` | Values available in code; cite file and line numbers |
| B.3 FastAPI Sample JSON Response | Sample `/api/v1/analyze` response | **[TODO]** Generate with `services/nlp` and a synthetic email. Record that BiLSTM-CRF shows `unavailable` |
| B.4 Inter-Annotator Agreement Output | κ and QW-κ output | **[TODO]** The script `scripts/kappa.py` is not in the repository |
| B.5 Sample Dataset Records | Example lines from `train.jsonl` and `dev.jsonl` | Available. Use 3–5 records, one per language |

### Appendix C — Supporting Source Code

Several files listed in the outline do not exist in the repository. Fix the outline or add the files before submission.

| Outline item | Status | Action |
|---|---|---|
| C.1 GitHub Repository Link | Available | Use the repository URL from the team; the root README names the upstream fork |
| C.2 `scripts/kappa.py` | **Missing** | Add the script or remove the item |
| C.3 `data/categories.json` | **Missing** | The category set is in the README and in code paths. Export it or remove the item |
| C.4 `eval/RESULTS.md` | **Missing** | Produce it from the re-run (T4) |
| C.5 `review/second_labeler_test_FILLED.csv` | **Missing** | The repo has `second_labeler_test_BLIND.csv` only. Add the filled version or cite the blind file |
| C.6 `data/test.jsonl` | **Missing** | The repo has `test_before_priority_fix.jsonl`. Confirm it is the frozen split and rename, or cite the actual file |

Paths in the repository are under `fastapi_core/data/`, not `data/`.

### Appendix D — Software Testing Documentation

| Section | Content | Status |
|---|---|---|
| D.1 Unit Test Results | `fastapi_core`: 10 passed (run on drafting date). `services/nlp`: not run | Partial |
| D.2 Integration Test Results | **[TODO]** | Pending (T2) |
| D.3 End-to-End Testing Plan | **[TODO]** | Pending (T5) |
| D.4 Load Testing Plan | **[TODO]** | Pending (T6) |
| D.5 User Testing Questionnaire (SUS/SEQ) | **[TODO]** | Pending (T7). Use the standard SUS items and the SEQ single-item scale |

### Appendix E — Project Progress Documentation

**E.1 Software Completion Summary.** Use Section 3.9.2. Headline: NLP pipeline 40% complete by planned phase (2 of 5). Chart: Figure 22.

**E.2 Completed Features**

- Multilingual embedding, similarity-based categorization, and τ = 0.35 threshold.
- Language tagging for English, Filipino, and Taglish.
- Rule-based deadline and instruction extraction with `needs_review` flag.
- Priority scoring (P1–P5) with weighted factors.
- Rocchio feedback endpoint (confirmation and correction updates).
- Chatbot tools for analysis and correction.
- Typed NLP client and field-level encryption.
- Inherited Gmail OAuth, sync, inbox, and calendar connections.

**E.3 Pending Features and Testing.** See Section 3.9.3 (D1–D9 and T1–T7).

**E.4 Future Development Plan**

1. Resolve the two-service question (D2) and commit the dataset (D1).
2. Re-run the evaluation and publish the harness (T3–T4).
3. Build the feedback UI and persistence (D3–D4).
4. Build the de-identified BIO dataset, train, and version the BiLSTM-CRF checkpoint (D5–D6).
5. Add the PII masking module (D7).
6. Run integration, end-to-end, load, and usability tests (T2, T5–T7).

---

## Reconciliation Checklist

1. Choose the production NLP service and align the README, phases document, and Chapter 3 text.
2. Commit `fastapi_core/data/`; confirm the frozen test file.
3. Re-run the evaluation or mark every result as reported.
4. Fix the Appendix C file list so each item exists or is removed.
5. Settle the `TASK`/`DATE` vs. `ACTION`/`DEADLINE` naming across figures and tables.
6. Resolve the register detector (D8) and the "learned priority" wording (D9).
7. Fill the **[REF]** and **[TODO]** items.
