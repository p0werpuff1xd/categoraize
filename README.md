# CategorAIze

**A multilingual email categorization system for Filipino professionals.**

CategorAIze is a fork of [Inbox Zero](https://github.com/elie222/inbox-zero) extended with a multilingual NLP service for the code-switched email (English, Taglish, Filipino) that Filipino professionals send and receive. It categorizes incoming Gmail messages into eight semantic categories, extracts task and deadline spans, and adapts to individual users through relevance feedback.

> Developed as a Software Engineering capstone project at De La Salle University – Dasmariñas.
> **Gutierrez, Kristine Ianne Marie P. · Quidit, Lauren Jade P. · Santos, Andjhelyn Denielle E.**

---

## What CategorAIze adds to Inbox Zero

| Feature | Inbox Zero (upstream) | CategorAIze (this repo) |
|---|---|---|
| Email categorization | Gmail's built-in tabs and AI rules | Zero-shot SBERT embeddings scored against per-category centroids (`fastapi_core/app/algorithms/cosine_similarity.py`) |
| Languages | English-dominant | Language tagging for `en`, `tl`, `taglish` via lexical markers (`fastapi_core/app/nlp/preprocessing.py`) |
| Deadline and instruction extraction | None | Rule-based extractor for relative (e.g. "tomorrow", "bukas") and explicit month-day dates (`fastapi_core/app/nlp/extraction.py`) |
| Personalization | None | Rocchio relevance feedback, stateless endpoint (`fastapi_core/app/algorithms/rocchio.py`) |
| Priority scoring | None | Weighted heuristic over urgency, deadline, sender, and calendar factors (`fastapi_core/app/algorithms/priority_scoring.py`) |
| Client integration | None | Typed client in `apps/web/utils/nlp/client.ts` |

---

## The Eight Categories

| Label | Description |
|---|---|
| `work_tasks` | Action items, deliverables, project work |
| `meetings` | Invitations, scheduling, calendar events |
| `school` | Academic correspondence, deadlines, enrollment |
| `job_search` | Applications, interviews, HR communications |
| `finance_billing` | Invoices, payments, bank and government fees |
| `promotions` | Marketing, newsletters, offers |
| `alerts` | System notifications, security alerts, service updates |
| `personal` | Personal correspondence and everything else |

The service is stateless: the category set, with each category's embedding vector, is sent in each classification request. Category descriptions are the intended source for those vectors. Users cannot rename or add categories.

---

## Architecture

```
Gmail API
    │
    ▼
Next.js application (apps/web)     ← inherited from Inbox Zero, extended with CategorAIze modules
    │  Gmail OAuth 2.0
    │  Prisma / Postgres persistence
    │  NLP client (apps/web/utils/nlp/client.ts)
    │
    ▼  HTTP, bearer token (NLP_SERVICE_TOKEN)
FastAPI intelligence service (fastapi_core)   ← stateless; holds no user data between requests
    │  /api/v1/embed     — multilingual embeddings (SBERT, 384-d)
    │  /api/v1/classify  — category ranking, language, deadlines, instructions, priority
    │  /api/v1/feedback  — Rocchio centroid update
    │
    ▼
Postgres (email metadata, classifications, centroids)
Upstash Redis                 ← Gmail webhook job queue (inherited)
```

The FastAPI service does not access the database, Gmail tokens, attachments, or raw unredacted email content. Next.js handles authorization, persistence, and provider mutations.

---

## NLP Components

### 1. Embeddings and categorization
- `paraphrase-multilingual-MiniLM-L12-v2` via `sentence-transformers`, 384-dimensional vectors, used without fine-tuning (`fastapi_core/app/services/embeddings.py`).
- Classification ranks the email vector against each category vector by cosine similarity and returns the best match only if it clears the threshold (default τ = 0.35, set in `ClassificationRequest`).

### 2. Rule-based extraction
- Deadlines and instructions are extracted with deterministic rules in `fastapi_core/app/nlp/extraction.py`, resolved against the message date and the user's timezone.
- Each candidate carries a confidence score and a `needs_review` flag.
- The repository does not currently include a learned span tagger (BiLSTM-CRF). See *Status* below.

### 3. Per-user Rocchio adaptation
- Implemented in `fastapi_core/app/algorithms/rocchio.py`, exposed at `POST /api/v1/feedback`.
- On confirmation: `c ← normalize(c + 0.20·e)`.
- On correction: `c ← normalize(c − 0.15·e)` for the incorrect category.
- Centroids are stored by the Next.js side and sent with each request; no model retraining is required.

### 4. Priority scoring
- Weighted sum of four factors, each clamped to [0, 1]: urgency 0.40, deadline 0.35, sender 0.25, calendar 0.20 (normalized to sum to 1).
- A dampener scales the score; the score maps to levels P1–P5 (`fastapi_core/app/algorithms/priority_scoring.py`).

---

## Dataset

Synthetic training and development data lives in `fastapi_core/data/synthetic/`:

| File | Lines |
|---|---|
| `train.jsonl` | 2,000 |
| `dev.jsonl` | 300 |

Team review material for the second-labeler agreement check is in `fastapi_core/data/categoraize-dataset/review/`.

No real user email was accessed or used at any stage of the study.

---

## Evaluation (reported)

The study reports the following on a frozen 100-email test set (34 English, 33 Taglish, 33 Filipino). **The evaluation harness, result files, and frozen split referenced by the study are not yet in this repository.** These figures are from the study write-up and have not been re-run here.

| Metric | B1 (Keywords) | B3 (SBERT + centroid) | B4 (Full system) |
|---|---|---|---|
| Category macro-F1 | 0.725 | 0.770 | 0.770 |
| Category accuracy | 0.680 | 0.770 | 0.770 |
| Priority exact | 0.360 | 0.370 | 0.420 |
| Resolved-date accuracy | 0.471 | 0.471 | 0.543 |
| Calendar-conflict accuracy | 0.990 | 0.990 | 1.000 |

Inter-annotator agreement on the same test set (blind second labeler): category Cohen's κ 0.97, priority QW-κ 0.79, register Cohen's κ 0.64.

---

## Repository Structure

```
.
├── apps/
│   ├── web/                        # Next.js application (CategorAIze + Inbox Zero)
│   │   └── utils/nlp/              # NLP service client
│   └── worker/                     # Background worker (inherited)
├── fastapi_core/                   # Stateless FastAPI intelligence service
│   ├── app/
│   │   ├── algorithms/             # cosine_similarity, rocchio, priority_scoring
│   │   ├── nlp/                    # preprocessing, extraction, summarizer
│   │   ├── services/               # embeddings
│   │   ├── main.py                 # HTTP endpoints
│   │   └── schemas.py              # request/response models
│   ├── data/
│   │   ├── synthetic/              # train and dev splits
│   │   └── categoraize-dataset/    # review material
│   ├── tests/                      # algorithm, NLP, and summarizer tests
│   └── pyproject.toml
├── docs/plans/                     # implementation and deployment plans
├── docker/                         # Dockerfiles (inherited, extended)
├── NORTHFLANK_DEPLOYMENT.md        # deployment guide
└── README.md                       # this file
```

---

## Getting Started

### Intelligence service (Windows, PowerShell)

```powershell
cd fastapi_core
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[ml,test]"
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Set `NLP_SERVICE_TOKEN` to require authenticated calls. Test the service:

```powershell
cd fastapi_core
python -m pytest
```

### Web application

Follow the upstream Inbox Zero setup guide at [docs.getinboxzero.com](https://docs.getinboxzero.com) and `AGENTS.md`. Set `NLP_SERVICE_URL` and `NLP_SERVICE_TOKEN` in `apps/web/.env` to point at the running service.

### Deployment

See [NORTHFLANK_DEPLOYMENT.md](NORTHFLANK_DEPLOYMENT.md).

---

## Privacy and Compliance

- **RA 10173 (Data Privacy Act of the Philippines):** the design intent is to scrub personal data before any NLP call, store no email bodies, and encrypt sensitive fields. Field-level AES-256-GCM encryption is implemented in `apps/web/utils/encryption.ts`. A dedicated PII masking module for NLP input is not yet in the repository; scrubbing is currently the Next.js side's responsibility.
- **Google API Limited Use:** Gmail data is used only to provide the service to the authenticated user. No real email is used for model training.
- **Research ethics:** the training and evaluation data are synthetic or team-written. No real user inboxes were accessed.

---

## Status

- Implemented: embedding service, rule-based extraction, Rocchio feedback, priority scoring, and the `/api/v1/*` endpoints. The `fastapi_core` test suite passes.
- Not yet in this repository: the learned span tagger, the evaluation harness and result files, and the frozen test split.

---

## Upstream

CategorAIze is a fork of [elie222/inbox-zero](https://github.com/elie222/inbox-zero). The upstream Next.js application, Gmail OAuth integration, and Upstash Redis job queue are inherited. The NLP service, its algorithms, the dataset, and the evaluation work are original contributions of this study.
