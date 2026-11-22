# CategorAIze: An AI-Based Customizable Email Classification and Prioritization System

**Document:** Software Engineering Project Documentation, Chapters 1–3 (draft)
**Source of truth:** this repository. Every technical claim below was checked against the code, docs, or tests in the repo on the date of drafting, unless it is marked as *reported* (taken from the study write-up and not reproducible from this repo) or as **[TODO]**.

> **Drafting notes for the team (remove before submission)**
> - Sections marked **[TODO]** need content that the repo does not contain (references, the frozen test split, evaluation outputs, screenshots, sign-off data).
> - Literature citations are limited to a few foundational works the team can verify. Every other citation slot is marked **[REF]** and must be filled with 2021–2026 sources. No references were invented.
> - Two NLP service packages exist in the repo (`fastapi_core/` and `services/nlp/`). Chapter 3 describes both and flags where they differ. The team should decide which one the thesis treats as the system of record.

---

## Preliminary Pages (not drafted here)

Title Page, Approval Sheet, Acknowledgment, Abstract, Table of Contents, List of Figures, List of Tables, and List of Abbreviations are outside the scope of this draft.

---

# CHAPTER 1 — INTRODUCTION

## 1.1 Background of the Study

Email remains a primary channel for work, school, and government transactions in the Philippines, yet the messages arrive mixed together. A single inbox can hold a meeting invitation, a tuition deadline, a bank billing notice, a job interview confirmation, and a promotional newsletter, often in the same afternoon. Most mainstream mail clients sort mail by sender or by generic tabs such as "Primary" and "Promotions." Neither approach tells the user which message needs action today.

Filipino professionals also write in a mix of English, Filipino, and Taglish (code-switched Tagalog and English). A message such as *"Pwede po bang i-send ang bayad sa kuryente by Friday?"* carries a task, a payment topic, and a deadline in a single sentence. Keyword rules built for English miss much of this, and generic language tools trained mostly on English text perform unevenly on code-switched input.

CategorAIze is a capstone system built to address this gap. It is a fork of the open-source Inbox Zero project, which provides Gmail integration, OAuth, and a Next.js application. CategorAIze adds a stateless NLP service that:

1. assigns each incoming Gmail message to one of eight semantic categories;
2. detects the language of the message (English, Filipino, or Taglish);
3. extracts deadline and instruction spans from the message text;
4. scores priority from urgency, deadline, sender, and calendar signals; and
5. adapts category centroids to each user's confirmations and corrections (Rocchio relevance feedback).

The eight categories are `work_tasks`, `meetings`, `school`, `job_search`, `finance_billing`, `promotions`, `alerts`, and `personal`.

## 1.2 Statement of the Problem

Filipino professionals receive high volumes of mixed-language email that existing clients do not organize by meaning, deadline, or priority. Specifically, the study addresses these problems:

1. **Categorization.** Existing tab and rule systems depend on sender or keywords and do not generalize to code-switched text.
2. **Deadline visibility.** Deadlines and requested actions are buried in the body text. Relative expressions such as *"bukas"* or *"next Friday"* are not converted into dates the user can act on.
3. **Personalization.** Users cannot teach a system their own categories or corrections without retraining a model.
4. **Privacy.** Email contains personal and sensitive data. Any intelligent system must limit what leaves the user's control and must comply with the Philippine Data Privacy Act (RA 10173).

## 1.3 Research Objectives

### 1.3.1 General Objective

To design, implement, and evaluate an AI-based, customizable email classification and prioritization system that handles English, Filipino, and Taglish email for Gmail users, while protecting user data.

### 1.3.2 Specific Objectives

1. To build a multilingual categorization module that ranks an email against eight category descriptions using multilingual sentence embeddings (SBERT, `paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions).
2. To build a rule-based extractor for deadlines and instructions that resolves relative dates against the message date and the user's timezone.
3. To implement a priority score built from urgency, deadline, sender, and calendar factors, mapped to levels P1–P5.
4. To implement Rocchio relevance feedback so that category centroids adapt to confirmed and corrected user decisions without retraining.
5. To evaluate the categorization, extraction, priority, and calendar-conflict components on a frozen test set and report the results with inter-annotator agreement.
6. To keep the NLP service stateless with respect to user data and to route all Gmail access through the Next.js application.

## 1.4 Significance of the Study

- **Students and professionals** gain a single view of tasks, meetings, and deadlines extracted from mixed-language mail.
- **Filipino-language users** receive a system designed for their actual writing, not one adapted from English-only tools.
- **Developers and researchers** receive a documented, reproducible reference for a multilingual email pipeline with a privacy-first architecture.
- **Institutions** receive a worked example of how RA 10173 principles (data minimization, purpose limitation, and security) can be applied in an NLP product.

## 1.5 Scope and Limitations

**In scope**

- Gmail accounts connected through OAuth 2.0 in the web application.
- Email in English, Filipino, and Taglish.
- Eight fixed categories defined by the team; users can confirm or correct category assignments.
- Rule-based deadline and instruction extraction for relative and explicit month-day dates.
- Priority scoring, Rocchio feedback, and a calendar-conflict check.

**Out of scope or not yet complete**

- A learned span tagger (BiLSTM-CRF) is implemented as code but has no trained checkpoint in the repository. The API reports it as `unavailable` rather than producing fabricated entities.
- Per-user persistence of Passive-Aggressive feedback is planned, not implemented (see Section 3.9).
- User-defined categories. Users cannot rename or add categories; the category set is fixed.
- Outlook or other providers. The inherited application supports Gmail; this study does not extend provider coverage.
- Use of real user inboxes for training. Training and development data are synthetic or team-written.
- Production-scale load testing and a formal usability study with external participants **[TODO: confirm whether conducted]**.

**Limitations to disclose**

- The reported evaluation uses a 100-email test set (34 English, 33 Taglish, 33 Filipino). The sample is small, and results should be read as indicative rather than general.
- Category labels in the repository's synthetic training file are not present; the file contains span markup only (Section 3.3).

## 1.6 Definition of Terms

| Term | Definition |
|---|---|
| **Taglish** | Code-switched writing that mixes Tagalog (Filipino) and English within a sentence or message. |
| **SBERT** | Sentence-BERT, a transformer model that produces fixed-length sentence embeddings compared with cosine similarity. |
| **Centroid** | The normalized mean vector representing a category, used for similarity scoring and Rocchio updates. |
| **Rocchio algorithm** | A relevance-feedback method that moves a query or centroid toward relevant examples and away from non-relevant ones. |
| **BiLSTM-CRF** | A bidirectional LSTM encoder with a conditional random field output layer, used for sequence labeling (here, action and deadline spans). |
| **BIO tagging** | A labeling scheme: B- marks the beginning of a span, I- marks inside a span, O marks tokens outside any span. |
| **Passive-Aggressive (PA) classifier** | An online linear classifier that updates on each labeled example; here used for per-user feedback. |
| **Cohen's κ / QW-κ** | Chance-corrected agreement between two raters; QW-κ is the quadratic-weighted version for ordinal labels. |
| **P1–P5** | Priority levels, from P1 (highest) to P5 (lowest). |
| **Gmail OAuth 2.0** | The authorization protocol through which the application reads and modifies a user's Gmail with consent. |
| **RA 10173** | The Philippine Data Privacy Act of 2012. |
| **PII** | Personally identifiable information. |

---

# CHAPTER 2 — REVIEW OF RELATED LITERATURE AND STUDIES

> Each subsection below states the problem each line of work addresses and how CategorAIze relates to it. Specific citations are marked **[REF]** and must be supplied from 2021–2026 sources, except where a foundational work is named.

## 2.1 Email Overload and Email Management Systems

Knowledge workers spend a large share of the day on email, and the cost of switching between messages and tasks is well documented **[REF: email overload / interruption studies]**. Email management tools respond with filters, folders, tabs, and snooze functions. These tools reduce noise but require users to set and maintain rules manually **[REF]**.

CategorAIze takes a different position: categories and priorities are proposed automatically, and the user's confirmations and corrections refine them over time.

## 2.2 Artificial Intelligence in Email Classification

Supervised text classifiers have been applied to spam detection, folder prediction, and intent classification **[REF]**. Most published systems assume a fixed label set with a large labeled training corpus. Such corpora are rarely available for Filipino email, and collecting real email for training raises privacy concerns under RA 10173.

CategorAIze avoids a large supervised corpus by using zero-shot similarity: each category is represented by a description-derived vector, and an email is assigned to the nearest category if the similarity clears a threshold (τ = 0.35 by default). This makes the category set editable without retraining.

## 2.3 Natural Language Processing for Email Analysis

Email has structure beyond plain text: headers, signatures, quoted replies, and forwarded threads. Preprocessing that removes quoted content and signatures is a standard step **[REF]**. CategorAIze's preprocessing performs language tagging with lexical markers for English, Filipino, and Taglish (`fastapi_core/app/nlp/preprocessing.py`). Header and quote stripping is the responsibility of the Next.js side **[TODO: confirm exact behavior]**.

## 2.4 Multilingual Email Processing (English, Filipino, and Taglish)

Multilingual sentence encoders such as multilingual BERT variants and multilingual MiniLM models map sentences from many languages into a shared vector space **[REF]**. The paraphrase-multilingual MiniLM model used here was trained for paraphrase similarity across languages and is used without fine-tuning.

Code-switched text is less studied than monolingual text. Work on Hinglish, Spanglish, and other code-switched corpora suggests that general multilingual encoders handle mixing reasonably but degrade on domain-specific or informal input **[REF]**. The Taglish portion of the test set is intended to measure this gap.

## 2.5 Semantic Email Categorization Using SBERT

Sentence-BERT (Reimers and Gurevych, 2019) fine-tunes BERT in a siamese configuration so that sentence embeddings can be compared with cosine similarity efficiently. Zero-shot use of SBERT-style embeddings against label descriptions is a common baseline for text classification **[REF]**.

CategorAIze uses SBERT embeddings, 384 dimensions, scored against per-category centroids. The baseline comparison (B1 keyword rules, B3 SBERT with centroids) is reported in Section 3.6.

## 2.6 Named Entity and Span Extraction Using Bi-LSTM-CRF

Bidirectional LSTM networks with a CRF output layer (Huang, Xu, and Yu, 2015) are an established approach for sequence labeling tasks such as named entity recognition and chunking. They model both left and right context and enforce valid label transitions through the CRF.

CategorAIze includes a BiLSTM-CRF implementation for BIO spans labeled `ACTION` and `DEADLINE` (`services/nlp/app/bilstm_crf.py`). **No trained checkpoint is included in the repository.** Until one is trained on approved, de-identified data, the system reports this component as unavailable. The current deadline extraction is rule-based (Section 3.4.2).

## 2.7 Email Priority Classification and Scoring

Priority inference from email has been approached through learned rankers and heuristics that combine sender importance, urgency words, and deadlines **[REF]**. Heuristic scoring is easier to explain to users and does not require labeled priority data at deployment.

CategorAIze uses a weighted heuristic with four factors (urgency 0.40, deadline 0.35, sender 0.25, calendar 0.20, normalized to sum to 1), clamped to [0, 1] and scaled by a dampener. The priority agreement study uses quadratic-weighted κ because priority levels are ordinal.

## 2.8 Adaptive Email Categorization Using the Rocchio Algorithm

Rocchio (1971) introduced relevance feedback for vector-space retrieval: a query vector is moved toward relevant documents and away from non-relevant ones. The update rule is widely used for adaptive filtering **[REF]**.

CategorAIze applies a Rocchio-style update to category centroids:

- on confirmation: `c ← normalize(c + 0.20·e)`;
- on correction: `c ← normalize(c − 0.15·e)` for the incorrect category,

where `e` is the email embedding (`fastapi_core/app/algorithms/rocchio.py`). Passive-Aggressive online learning (Crammer et al., 2006) is a second adaptation mechanism in the separate `services/nlp` package; it is planned for persistence (Section 3.4.5).

## 2.9 Calendar Integration and Deadline Conflict Detection

Calendar-aware assistants detect scheduling conflicts and surface upcoming commitments **[REF]**. Conflict detection requires reliable time resolution, which is why CategorAIze resolves relative dates against the message timestamp and the user's timezone before comparing them with calendar events.

## 2.10 Data Privacy and Email Security

Email contains sensitive personal, financial, and employment data. Privacy-preserving designs minimize data sent to models, avoid storing message bodies, and encrypt stored fields **[REF]**. Philippine law adds obligations under RA 10173, including data minimization, purpose limitation, security measures, and rights of data subjects. The National Privacy Commission publishes implementing guidance **[REF]**.

Google's API Services User Data Policy, including the Limited Use requirements, restricts how Gmail data may be used **[REF]**. CategorAIze's design follows these constraints by keeping Gmail access in the web application and using only synthetic or team-written data for training.

## 2.11 Review of Existing Email Management Systems

| System type | Typical approach | Gap relative to CategorAIze |
|---|---|---|
| Native Gmail tabs and smart labels | Sender and content heuristics; fixed categories | No user-defined categories; English-dominant; no deadline extraction |
| Inbox Zero (upstream) | Open-source AI rules, Gmail integration | Rule-driven; no multilingual NLP; no Rocchio or priority model |
| Commercial productivity assistants **[REF]** | Summarization and task extraction | Usually English-only; closed; data handling outside user control |
| Academic prototypes **[REF]** | Classification with supervised corpora | Rarely cover Taglish; often require real labeled mail |

**[TODO]** Replace the rows above with cited systems and fill Table 1 in the final manuscript.

## 2.12 Synthesis of Related Literature and Research Gap

The reviewed work supports four points that CategorAIze builds on:

1. Sentence embeddings allow zero-shot categorization without large labeled corpora.
2. Sequence labeling with BiLSTM-CRF is effective for spans, but it requires annotated data.
3. Rocchio-style feedback provides personalization without retraining.
4. Privacy obligations constrain how real email may be used for research.

The gap this study addresses is the combination of these four points for **Filipino and Taglish email**, with a privacy-first architecture and no dependence on real user mail for training. The study contributes a multilingual categorization and extraction pipeline, a documented feedback loop, and an evaluation on a frozen, mixed-language test set.

---

# CHAPTER 3 — METHODOLOGY

## 3.1 Research Design and Development Approach

### 3.1.1 Research and Development Method

The study follows a design-and-development (R&D) approach. Components were built iteratively, each was tested against a baseline, and the results were used to decide the next change. Evaluation uses a frozen test set and blind second-labeler agreement so that design choices are not tuned on the test data.

### 3.1.2 Software Development Life Cycle

The project uses an incremental life cycle. The NLP work is staged as described in `docs/categoraize-nlp-incremental-implementation.md`:

| Phase | Scope | Status (repo) |
|---|---|---|
| 1 | FastAPI NLP foundation, SBERT similarity, explicit `ready`/`unavailable` statuses | Implemented |
| 2 | Chatbot integration: `analyzeEmail` and `correctEmailCategory` server tools | Implemented at the server tool layer |
| 3 | Passive-Aggressive feedback UI | Planned |
| 4 | Passive-Aggressive persistence in PostgreSQL | Planned |
| 5 | BiLSTM-CRF annotation and training | Planned |

The phases are deliberately separable: each one is usable on its own, and none fabricates predictions when a model is unavailable.

### 3.1.3 Development Tools and Technologies

| Layer | Tool / technology | Repository location |
|---|---|---|
| Web application | Next.js (TypeScript), inherited from Inbox Zero | `apps/web/` |
| Persistence | PostgreSQL via Prisma ORM | `apps/web/prisma/schema.prisma` |
| Authentication | better-auth; Gmail OAuth 2.0 | `apps/web/` |
| Background jobs | Worker app; Upstash Redis queue | `apps/worker/` |
| NLP service | FastAPI (Python) | `fastapi_core/`, `services/nlp/` |
| Embeddings | sentence-transformers, `paraphrase-multilingual-MiniLM-L12-v2` | `fastapi_core/app/services/embeddings.py` |
| Sequence labeling | PyTorch (optional dependency) | `services/nlp/app/bilstm_crf.py` |
| Personal classifier | scikit-learn `PassiveAggressiveClassifier` | `services/nlp/app/pa.py` |
| Testing | pytest; TypeScript test tooling in the monorepo | `fastapi_core/tests/`, `services/nlp/tests/` |
| Containers and deployment | Docker; deployment guides | `docker/`, `NORTHFLANK_DEPLOYMENT.md`, `docs/plans/` |
| Client–server contract | Typed NLP client | `apps/web/utils/nlp/client.ts` |

**Table 2 (Development Tools and Technologies)** can be generated from the table above.

## 3.2 System Architecture and Design

### 3.2.1 Overall System Architecture

```
Gmail API
    │
    ▼
Next.js application (apps/web)      Gmail OAuth, Prisma/Postgres, authorization,
    │                               PII scrubbing policy, NLP client
    │  HTTP + bearer token (NLP_SERVICE_TOKEN)
    ▼
FastAPI intelligence service        Stateless: no database, no Gmail tokens,
    │                               no attachments, no raw unredacted content
    │  /api/v1/embed     (fastapi_core)
    │  /api/v1/classify  (fastapi_core)
    │  /api/v1/feedback  (fastapi_core)
    │  /api/v1/analyze   (services/nlp)
    ▼
Postgres (metadata, classifications, centroids)
Upstash Redis (Gmail webhook job queue, inherited)
```

The separation is a security decision. The NLP service never receives credentials for Gmail and never writes to the database. The web application is the only component that acts on the user's mailbox.

### 3.2.2 System Workflow

1. A Gmail notification or sync job queues the message for processing.
2. The web application retrieves the message, removes attachments and sensitive fields, and prepares the text.
3. The NLP client sends the text and the category set (each category's description vector) to the service.
4. The service returns the best category if its similarity clears τ = 0.35, the detected language, extracted deadline and instruction candidates, and a priority level.
5. The web application stores the result, shows the category and priority, and applies user-approved labels only.
6. When the user confirms or corrects a category, the feedback endpoint returns updated centroids, which the web application stores.

**[TODO]** Confirm step 2 against the sync code path and document the exact fields removed before the NLP call.

### 3.2.3 Use Case Diagram

The use case diagram is in `docs/categoraize-use-case-diagram.svg` (source: `docs/categoraize-use-case-diagram.puml`). **[TODO]** Insert as Figure 3 and describe the actors: user, Gmail, NLP service, and the web application.

### 3.2.4 Data Flow Diagram

**[TODO]** Draw Level 0 and Level 1 DFDs from Section 3.2.2. External entities: user, Gmail API. Processes: sync, sanitize, classify, extract, score, feedback. Data stores: Postgres, Redis.

### 3.2.5 Database Design and Entity Relationship Diagram

The relevant tables in `apps/web/prisma/schema.prisma` include `EmailAccount`, `Category`, `ClassificationFeedback`, `EmailMessage`, `Label`, `Rule`, `ExecutedRule`, `Newsletter`, and `ColdEmail`. The inherited schema contains many additional models (calendar, booking, chat, and others) that are outside this study's scope. The entities most relevant to CategorAIze are:

| Entity | Role |
|---|---|
| `Category` | User-visible category set; the fixed eight-category vocabulary is mapped onto it |
| `ClassificationFeedback` | Stores a user's confirmation or correction of a predicted category |
| `EmailMessage` | Email metadata and classification result for each processed message |
| `EmailAccount` | Connected Gmail account; scopes all per-user data |
| `CalendarConnection` / `Calendar` | Calendar sources used by the calendar-conflict factor |

**[TODO]** Generate the ERD (Figure 5) from the schema and confirm which tables store centroids. The README states that centroids are stored by the Next.js side, but the table that holds them was not confirmed during drafting.

### 3.2.6 System Modules and Integration

| Module | Responsibility | Location |
|---|---|---|
| Embeddings | Batch multilingual embeddings | `fastapi_core/app/services/embeddings.py` |
| Similarity | Cosine similarity and category ranking | `fastapi_core/app/algorithms/cosine_similarity.py` |
| Preprocessing | Language tagging via lexical markers | `fastapi_core/app/nlp/preprocessing.py` |
| Extraction | Rule-based deadline and instruction extraction | `fastapi_core/app/nlp/extraction.py` |
| Summarizer | Summary generation for NLP output | `fastapi_core/app/nlp/summarizer.py` |
| Rocchio | Centroid adaptation | `fastapi_core/app/algorithms/rocchio.py` |
| Priority | Weighted priority scoring, P1–P5 | `fastapi_core/app/algorithms/priority_scoring.py` |
| BiLSTM-CRF | Span tagging (no checkpoint shipped) | `services/nlp/app/bilstm_crf.py` |
| Passive-Aggressive | Per-user online classifier | `services/nlp/app/pa.py` |
| Chatbot tools | `analyzeEmail`, `correctEmailCategory` | `apps/web/utils/ai/assistant/nlp-tools.ts` |
| Encryption | AES-256-GCM field encryption (versioned keys) | `apps/web/utils/encryption.ts` |
| NLP client | Typed client for the service | `apps/web/utils/nlp/client.ts` |

## 3.3 Dataset Collection and Preparation

### 3.3.1 Dataset Sources and Description

No real user email is used. Two sources were used:

1. **Synthetic training and development data** in `fastapi_core/data/synthetic/`:
   - `train.jsonl`: 2,000 records.
   - `dev.jsonl`: 300 records.
   Each record has a `lang` field and a `markup` field. The markup wraps spans in `[DATE]…[/DATE]` and `[TASK]…[/TASK]` tags. Examples are written in English, Filipino, and Taglish.
2. **Team-written evaluation material** in `fastapi_core/data/categoraize-dataset/review/`:
   - `test_before_priority_fix.jsonl`: 100 lines.
   - `second_labeler_test_BLIND.csv`: 100 rows plus a header, used for blind second-labeler agreement.

Table 5 (Dataset Description and Sources) should be filled from this section. **[TODO]** Confirm that `test_before_priority_fix.jsonl` is the frozen 100-email test set. The README states that the frozen split is not in the repository, but this file has the expected size. Also confirm whether it was modified after the priority fix; the filename suggests it predates that fix.

**Repository status note.** `fastapi_core/data/` is currently untracked in git. It must be committed (or ignored deliberately) before the dataset can be cited as part of the repository.

### 3.3.2 Email Collection Procedure

Synthetic records were written by the team to mirror the kinds of messages in the eight categories, in the three language conditions. **[TODO]** Document the authoring procedure: who wrote the records, the instructions given, and how many were drafted and discarded.

### 3.3.3 Data Cleaning and Preprocessing

Preprocessing applied in the repository:

- Language tagging with lexical markers for `en`, `tl`, and `taglish` (`preprocessing.py`).
- Text length capped by `NLP_MAX_TEXT_CHARS` (default 12,000) in the `services/nlp` package.
- Span markup is stripped to tokens and BIO labels for sequence training (planned, Phase 5).

**[TODO]** Confirm what the Next.js side removes (quoted replies, signatures, attachments, personal identifiers) before the call, and cite the code path.

### 3.3.4 Email Annotation Guidelines

Annotation covers three things: the category of each message, the priority level (P1–P5), and the span labels for deadlines and actions. Span labels in the planned BIO scheme are `O`, `B-ACTION`, `I-ACTION`, `B-DEADLINE`, and `I-DEADLINE`.

**Discrepancy to resolve.** The synthetic files use `TASK` and `DATE` tags, while the planned BiLSTM-CRF scheme uses `ACTION` and `DEADLINE`. The mapping (`TASK` → `ACTION`, `DATE` → `DEADLINE`) should be stated explicitly in Table 9 if it is adopted.

**[TODO]** Attach the full guideline document (Table 9). The repository does not contain a written guideline.

### 3.3.5 Dataset Distribution

**Table 7 (Dataset Label Distribution).** Language distribution of the synthetic files, verified from the repository:

| Split | English | Filipino (`tl`) | Taglish | Total |
|---|---|---|---|---|
| Train | 667 | 667 | 666 | 2,000 |
| Dev | 100 | 100 | 100 | 300 |

The synthetic files do not include category labels; category distribution is **[TODO]** from the team's labeling record.

For the 100-email test set, the reported distribution is 34 English, 33 Taglish, and 33 Filipino (*reported*).

### 3.3.6 Training, Validation, and Testing Splits

- **Training:** `train.jsonl` (2,000).
- **Validation:** `dev.jsonl` (300), used for development decisions.
- **Testing:** a frozen 100-email set, used once for the reported evaluation (*reported*).

The split is balanced by language in the synthetic files. Table 8 can be filled from the counts above.

### 3.3.7 Inter-Annotator Agreement

A blind second labeler annotated the same 100-email test set without access to the first labeler's decisions (`second_labeler_test_BLIND.csv`). Agreement is reported in Section 3.6.8.

## 3.4 AI Models and Algorithms

### 3.4.1 SBERT-Based Email Categorization

**Model.** `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, used without fine-tuning, producing 384-dimensional vectors (`fastapi_core/app/services/embeddings.py`; default configured in `services/nlp/app/config.py`).

**Method.**
1. Embed the email text.
2. Compute cosine similarity to each category vector. Category vectors are built from category descriptions and sent with each request.
3. Assign the highest-scoring category only if its similarity is at least τ = 0.35 (`ClassificationRequest`, `fastapi_core/app/schemas.py`).

**Rationale.** Zero-shot similarity lets the category set change without retraining, which matters because categories are fixed by the team but should remain editable.

### 3.4.2 Bi-LSTM-CRF TASK and DATE Extraction

**Implemented now: rule-based extraction.** `fastapi_core/app/nlp/extraction.py` resolves:
- relative expressions in English and Filipino (for example *"tomorrow"*, *"bukas"*, *"next Friday"*), relative to the message date and the user's timezone;
- explicit month-day dates.

Each candidate carries a confidence score and a `needs_review` flag. Candidates flagged for review are shown to the user rather than acted on automatically.

**Designed but not trained: BiLSTM-CRF.** `services/nlp/app/bilstm_crf.py` defines an embedding layer, a bidirectional LSTM encoder, a linear emission layer, and CRF transition matrices, with Viterbi decoding. Until a checkpoint (`services/nlp/models/bilstm-crf.pt`) is present, the API returns `bilstm_crf.status = "unavailable"`. **No checkpoint is in the repository, and no BiLSTM-CRF result may be reported as a model prediction.**

**Reported.** Deadline resolved-date accuracy is 0.471 for B1–B3 and 0.543 for B4 (Section 3.6).

### 3.4.3 Learned Email Priority Classification

Priority is a weighted heuristic, not a learned model in the current repository (`fastapi_core/app/algorithms/priority_scoring.py`):

- factors: urgency (0.40), deadline (0.35), sender (0.25), calendar (0.20), each clamped to [0, 1] and normalized to sum to 1;
- score = weighted sum × dampener (bounded);
- score mapped to levels P1 (highest) through P5.

**Reported.** Exact priority agreement is 0.360 (B1), 0.370 (B3), and 0.420 (B4), with quadratic-weighted κ = 0.79 between the two labelers.

**Note.** The thesis title and outline use "learned" priority classification. The current implementation is heuristic. The team should either rename Section 3.4.3 to "Heuristic Priority Scoring" or document a learned variant if one was trained elsewhere.

### 3.4.4 Rule-Based Register Detection

**[TODO]** Register detection (formal, informal, or mixed register) is reported in the study (register κ = 0.64) but no register classifier was found in `fastapi_core/app/`. Locate the implementation or remove this subsection and the register agreement value.

### 3.4.5 Rocchio-Based Personalized Categorization

- Confirmation: `c ← normalize(c + 0.20·e)`.
- Correction: `c ← normalize(c − 0.15·e)` for the incorrect category.
- Endpoint: `POST /api/v1/feedback` (`fastapi_core/app/main.py`). The endpoint is stateless; the caller supplies current centroids and stores the returned ones.

**Passive-Aggressive learning.** `services/nlp/app/pa.py` implements a per-user `PassiveAggressiveClassifier` with a minimum-example threshold (`PA_MIN_EXAMPLES`, default 2). Below the threshold, the service returns `unavailable`. Persistence to PostgreSQL and the feedback UI are planned (Phases 3–4).

### 3.4.6 Calendar Conflict Detection

Calendar conflict detection compares resolved deadlines from extraction with the user's calendar events. The priority score includes a calendar factor (weight 0.20).

**Reported.** Calendar-conflict accuracy is 0.990 for B1–B3 and 1.000 for B4 (*reported*; the evaluation set is not in the repository).

### 3.4.7 Personally Identifiable Information (PII) Masking

**Current state.** The README states that a dedicated PII masking module for NLP input is not yet in the repository, and that scrubbing is the Next.js side's responsibility. Field-level encryption is implemented (`apps/web/utils/encryption.ts`, AES-256-GCM, with key versioning).

**Required before submission.** Either document the Next.js scrubbing code path with file references, or state that PII masking is a limitation and a planned component. The outline's Section 3.4.7 should not describe a masking module that does not exist in the repository.

## 3.5 System Implementation

### 3.5.1 Next.js Frontend Application

The web application (`apps/web/`) is inherited from Inbox Zero and extended with CategorAIze modules. It provides account connection, inbox display, category and priority labels, and the chatbot. The NLP client is `apps/web/utils/nlp/client.ts`.

**[TODO]** Add screenshots for Figures 12–18 from the running application.

### 3.5.2 FastAPI NLP Backend

Two service packages exist:

| Package | Endpoints | Notes |
|---|---|---|
| `fastapi_core/` | `GET /healthz`, `POST /api/v1/embed`, `POST /api/v1/classify`, `POST /api/v1/feedback` | Described in `fastapi_core/README.md` and the root README. Embedding, classification, extraction, priority, and Rocchio. |
| `services/nlp/` | `GET /health`, `POST /api/v1/analyze`, `POST /api/v1/feedback` | Described in `services/nlp/README.md` and the phases document. Adds BiLSTM-CRF (unavailable) and Passive-Aggressive. |

Both require a bearer token (`NLP_SERVICE_TOKEN`). `services/nlp` additionally uses `X-User-Id` and `X-Internal-Service-Token` headers.

**Decision required.** The team must state which service is the production intelligence service and whether the other is retired or kept for the Phase 5 work.

### 3.5.3 Supabase Database Integration

The application stores data in PostgreSQL through Prisma. Phase 4 plans to persist Passive-Aggressive state and verified feedback in Supabase PostgreSQL, scoped per user, with model versioning and idempotent feedback submission. This is not implemented in the repository.

### 3.5.4 Gmail Integration and Email Synchronization

Gmail OAuth 2.0 and synchronization are inherited from Inbox Zero. The Gmail webhook job queue uses Upstash Redis. CategorAIze does not change the OAuth scopes in this draft **[TODO: confirm requested scopes against the Google API Limited Use requirements]**.

### 3.5.5 Email Classification and Priority Display

The application displays the predicted category and priority. Predictions are shown with their source: the SBERT category result, the Passive-Aggressive result (when available), and the BiLSTM-CRF result (currently unavailable). The chatbot reports these separately.

### 3.5.6 Task and Deadline Extraction

Deadlines and instructions come from the rule-based extractor (Section 3.4.2). Candidates include a confidence score and a `needs_review` flag; the interface should not apply them automatically when the flag is set.

### 3.5.7 Category Management and User Feedback

- The category set is fixed to the eight categories. Users cannot rename or add categories.
- The chatbot tool `correctEmailCategory` submits a correction only when the user clearly means to correct the prediction (`apps/web/utils/ai/assistant/nlp-tools.ts`).
- Corrections do not change the email's label, archive state, or folder automatically (Phase 3 requirement).
- Dismissed, ambiguous, or unconfirmed suggestions are not used for training.

### 3.5.8 Calendar Integration

Calendar connections are inherited from the application (`CalendarConnection` and `Calendar` models). The calendar factor in priority scoring and the conflict check use these connections. **[TODO]** Confirm which calendar provider(s) are supported end to end.

### 3.5.9 Data Privacy and Access Control

- The NLP service is stateless and does not access the database, Gmail tokens, or attachments.
- The NLP service token is server-only; the browser never receives it.
- Stored sensitive fields are encrypted with AES-256-GCM and versioned keys (`apps/web/utils/encryption.ts`).
- Training uses only synthetic or team-written data.
- The NLP service accepts user identity from headers and not from the request body (`services/nlp/README.md`).

## 3.6 Model Evaluation and Experimental Results

> **Important:** Results in this section are *reported* from the study write-up. The evaluation harness, result files, and frozen split are **not** in the repository, so these figures have not been re-run here. They must be reproduced, or clearly marked as reported, before submission.

### 3.6.1 Evaluation Methodology

The evaluation uses a frozen 100-email test set (34 English, 33 Taglish, 33 Filipino). Four configurations are compared:

| ID | Configuration |
|---|---|
| B1 | Keyword baseline |
| B2 | Model configuration variant **[TODO: define]** |
| B3 | SBERT embeddings with per-category centroids |
| B4 | Full system (SBERT + centroids + extraction + priority + calendar) |

B2 is referenced in the outline but its definition is not in the README. **[TODO]** Define B2 and explain the tuning decisions between B1 and B3.

### 3.6.2 Evaluation Metrics

- Category: macro-F1 and accuracy.
- Priority: exact agreement; quadratic-weighted κ for ordinal agreement.
- Deadline: resolved-date accuracy.
- Calendar conflict: accuracy.
- Agreement: Cohen's κ (category, register) and QW-κ (priority).

### 3.6.3 B1 — Baseline Model Results

*Reported:* category macro-F1 0.725; accuracy 0.680; priority exact 0.360; resolved-date accuracy 0.471; calendar-conflict accuracy 0.990.

### 3.6.4 B2 — Model Configuration Results

**[TODO]** Results not reported in the repository.

### 3.6.5 B3 — Optimized Model Results

*Reported:* category macro-F1 0.770; accuracy 0.770; priority exact 0.370; resolved-date accuracy 0.471; calendar-conflict accuracy 0.990.

### 3.6.6 B4 — Final Model Results

*Reported:* category macro-F1 0.770; accuracy 0.770; priority exact 0.420; resolved-date accuracy 0.543; calendar-conflict accuracy 1.000.

### 3.6.7 Comparative Performance Analysis

**Table 13 / Table 14 (reported):**

| Metric | B1 | B3 | B4 |
|---|---|---|---|
| Category macro-F1 | 0.725 | 0.770 | 0.770 |
| Category accuracy | 0.680 | 0.770 | 0.770 |
| Priority exact | 0.360 | 0.370 | 0.420 |
| Resolved-date accuracy | 0.471 | 0.471 | 0.543 |
| Calendar-conflict accuracy | 0.990 | 0.990 | 1.000 |

Observations to verify with per-language breakdowns:
- The category gain from B1 to B3 is 0.045 macro-F1 and 0.090 accuracy.
- B4 improves priority and date resolution; category results are unchanged from B3.
- **[TODO]** Report per-language results (English, Filipino, Taglish). The claim that SBERT helps Taglish specifically needs this breakdown.

### 3.6.8 Inter-Annotator Agreement Results

*Reported:* category Cohen's κ 0.97; priority QW-κ 0.79; register Cohen's κ 0.64.

**Interpretation.** Category agreement is very high. Register agreement is moderate (substantial by common benchmarks, but lower than category), which matches the register subsection being the least supported by repository code (Section 3.4.4).

## 3.7 Software Testing and Validation

### 3.7.1 Unit Testing

**Verified in this draft.** `fastapi_core` test suite run on the current repository:

```
10 passed in 0.19s
```

The suite covers algorithms (`test_algorithms.py`, 5 tests), NLP preprocessing and extraction (`test_nlp.py`, 4 tests), and the summarizer (`test_summarizer.py`, 1 test).

**Not run in this draft.** `services/nlp/tests/` contains 4 tests (`test_api.py`, `test_preprocessing.py`). They were not executed because the optional dependencies were not verified. **[TODO]** Run them and record the output.

### 3.7.2 Integration Testing

**[TODO]** Integration tests between the Next.js client (`apps/web/utils/nlp/client.ts`) and the NLP service were not located in this draft. Table 15 needs these results.

### 3.7.3 End-to-End Testing

**[TODO]** The monorepo has Playwright-based scripts (`scripts/run-e2e-local.sh`, `scripts/publish-playwright-report.sh`). Record which flows cover CategorAIze features (classification display, correction, extraction) and their results. Table 16 currently has no data.

### 3.7.4 Performance and Load Testing

**[TODO]** No load test results are in the repository. The planned load test scenarios and pass criteria are not defined here. Record latency for `/api/v1/classify` on the target hardware, or state that load testing is pending.

### 3.7.5 User Acceptance and Usability Testing

**[TODO]** The SUS and SEQ questionnaire (Table 17, Appendix D.5) and participant results are not in the repository. Record the participant count, recruitment, and scores, or state that usability testing is pending.

### 3.7.6 Testing Limitations and Pending Activities

- The evaluation set is small (100 emails).
- Results are reported from the study write-up and not reproducible from the repository.
- BiLSTM-CRF cannot be evaluated without a checkpoint.
- Passive-Aggressive persistence and the feedback UI are not implemented, so the feedback loop is tested only at the algorithm level.
- Load, end-to-end, and usability testing are pending.

## 3.8 Ethical Considerations and Data Privacy

### 3.8.1 Informed Consent

Users who connect Gmail consent through the OAuth flow. Consent for any study participation (usability testing, second-labeler annotation) **[TODO: confirm forms and approvals]**.

### 3.8.2 Email Data Anonymization

No real email is used for training or evaluation. Synthetic and team-written data are the only sources (README, "Research ethics"). The NLP service does not store message bodies.

### 3.8.3 Data Storage and Protection

- Sensitive fields are encrypted with AES-256-GCM and versioned keys (`apps/web/utils/encryption.ts`).
- The NLP service is stateless; Phase 4 persistence will store verified feedback only, scoped per user.
- Secrets are supplied by environment variables; `NLP_SERVICE_TOKEN` is server-only.

### 3.8.4 Compliance with RA 10173

Design intent:
- **Data minimization:** the NLP service receives only the text needed for the request.
- **Purpose limitation:** Gmail data is used only to provide the service to the authenticated user.
- **Security:** encryption, token-based service authentication, and separation of duties between services.
- **Rights of data subjects:** **[TODO]** Document how users access, correct, and delete their data, and reference the application's deletion flow.

**Gap.** A dedicated PII masking module for NLP input is not yet implemented (Section 3.4.7).

### 3.8.5 Data Retention and Erasure

The NLP service retains no data between requests. Retention in the web application and the Phase 4 persistence design **[TODO: define retention periods and the erasure procedure]**.

## 3.9 Project Development Progress

### 3.9.1 Completed System Components

| Component | Status | Evidence |
|---|---|---|
| Multilingual SBERT embedding service | Complete | `fastapi_core/app/services/embeddings.py` |
| Category similarity with τ = 0.35 | Complete | `fastapi_core/app/algorithms/cosine_similarity.py` |
| Language tagging (en, tl, taglish) | Complete | `fastapi_core/app/nlp/preprocessing.py` |
| Rule-based deadline and instruction extraction | Complete | `fastapi_core/app/nlp/extraction.py` |
| Priority scoring (P1–P5) | Complete | `fastapi_core/app/algorithms/priority_scoring.py` |
| Rocchio feedback endpoint | Complete | `fastapi_core/app/algorithms/rocchio.py` |
| Chatbot NLP tools | Complete at server layer | `apps/web/utils/ai/assistant/nlp-tools.ts` |
| Typed NLP client | Complete | `apps/web/utils/nlp/client.ts` |
| Field encryption | Complete | `apps/web/utils/encryption.ts` |
| `services/nlp` analyze and feedback API | Complete, with BiLSTM-CRF unavailable | `services/nlp/app/main.py` |
| Passive-Aggressive classifier | Implemented; persistence not done | `services/nlp/app/pa.py` |

### 3.9.2 Software Completion Percentage

**[TODO]** Compute from the component list and the phases table (Section 3.1.2). Suggested method: count completed phases and components, weight by the outline's Table 18 categories, and state the formula. Do not report a percentage without it.

### 3.9.3 Remaining Development and Testing Activities

| Activity | Status |
|---|---|
| Commit `fastapi_core/data/` to version control | Pending (currently untracked) |
| Reconcile `fastapi_core/` and `services/nlp/` into one documented service | Pending |
| Phase 3: feedback UI for Passive-Aggressive predictions | Planned |
| Phase 4: Passive-Aggressive persistence in PostgreSQL | Planned |
| Phase 5: de-identified BIO dataset, training, and checkpoint | Planned |
| Commit or publish the evaluation harness and frozen split | Pending |
| Re-run and verify all reported evaluation numbers | Pending |
| Run `services/nlp` tests | Pending |
| Integration, end-to-end, load, and usability testing | Pending |
| PII masking module for NLP input | Not started |

---

## Reconciliation Checklist (for the team)

1. Choose the production NLP service (`fastapi_core` or `services/nlp`) and align the README, phases document, and this chapter.
2. Commit `fastapi_core/data/` and confirm the frozen test set.
3. Re-run the evaluation, or label every number in Section 3.6 as reported.
4. Resolve the `TASK`/`DATE` vs. `ACTION`/`DEADLINE` label naming.
5. Locate or remove the register detector (Section 3.4.4).
6. Rename "learned priority" to "heuristic priority" unless a learned variant exists.
7. Fill every **[REF]** and **[TODO]** before the manuscript is finalized.
