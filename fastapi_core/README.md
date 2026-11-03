# CategorAIze Intelligence Service

This service owns bilingual preprocessing, embedding inference, email classification, deadline/instruction extraction, priority scoring, and Rocchio feedback.

## Local setup

From `fastapi_core`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[ml,test]"
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Set `NLP_SERVICE_TOKEN` when the service should require authenticated API calls. The Next.js application sends the same value through its `NLP_SERVICE_TOKEN` environment variable.

## Endpoints

- `GET /healthz` — unauthenticated readiness check.
- `POST /api/v1/embed` — batch multilingual embeddings.
- `POST /api/v1/classify` — classification, language detection, extraction, and priority scoring.
- `POST /api/v1/feedback` — Rocchio centroid adaptation from an accepted user correction.

When `NLP_SERVICE_TOKEN` is configured, the two API endpoints require:

```text
Authorization: Bearer <NLP_SERVICE_TOKEN>
```

The service does not access Prisma, Gmail tokens, attachments, or raw unredacted email content. Next.js is responsible for authorization, PII scrubbing, persistence, and provider mutations.
