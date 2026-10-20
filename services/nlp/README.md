# CategorAIze NLP service

This is the local FastAPI model service described in the PRD. It is intentionally
separate from Gmail and Prisma: the existing Next.js server remains responsible
for OAuth, email ownership, sanitization policy, persistence, and browser calls.

## Run locally

```powershell
cd services/nlp
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
$env:NLP_SERVICE_TOKEN = "local-development-token"
uvicorn app.main:app --reload --port 8001
```

The pretrained SBERT model downloads on first inference. Set `NLP_MODEL_DIR` to
store local PA state and the trained `bilstm-crf.pt` checkpoint outside the source
tree. Until a valid checkpoint exists, the API returns BiLSTM-CRF `status=unavailable`
and never labels a fallback as a model prediction.

## API authentication

Internal callers send `X-User-Id` and, when `NLP_SERVICE_TOKEN` is configured,
`X-Internal-Service-Token`. The user identity is not accepted from the JSON body.
