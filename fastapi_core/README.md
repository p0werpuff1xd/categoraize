# CategorAIze NLP service

Stateless FastAPI service called by the web app (`apps/web`). The web app
sends category data with every request and stores the results; the service
keeps no per-user state.

## What it does

| Piece | Where | Notes |
| --- | --- | --- |
| Sentence-BERT classification | `app/algorithms/classifier.py`, `app/services/embeddings.py` | `paraphrase-multilingual-MiniLM-L12-v2`, 384-d. The email vector is the normalized mean of its subject and sentence embeddings. A category matches when its cosine similarity is at least `threshold` (default 0.35). |
| Rocchio feedback | `app/algorithms/feedback.py` | `c_correct = normalize(c_correct + 0.20*e)`, `c_incorrect = normalize(c_incorrect - 0.15*e)`. Rejects zero vectors and corrections where the correct and incorrect category are the same. |
| Suggested labels | `app/algorithms/label_library.py` | Only from a fixed library of 12 templates, only when nothing matched, never an existing name. Creating the label is the user's decision. |
| TASK/DATE spans | `app/nlp/regex_tagger.py` | Bounded regex baseline until the Bi-LSTM-CRF (Phase 4) exists; kept afterwards as fallback and comparison. Spans carry `tagger: "regex"`. |
| Date resolution | `app/nlp/extractor.py` | Resolves against `received_at` in the user's timezone. Date-only phrases default to 17:00. Vague phrases (`mamaya`, `next Friday`, `3/4`) are flagged `ambiguous`. |
| Taglish normalizer | `app/nlp/taglish_cleaner.py`, `app/data/taglish_lexicon.json` | Dictionary of about 200 entries: `paki-` requests, particles, time words, weekdays, months. |
| Language ID | `app/nlp/language.py` | `en`, `tl`, `mixed` or `unknown`: lexicon rules first, `langdetect` as fallback. |
| Priority P1-P5 | `app/ml/priority_rules.py` | Deterministic rules (plan section 7): category base + deadline (+2 within 24 h or overdue, +1 within 72 h) + role (Director/Executive +2, Manager +1) + calendar (+1 when the deadline is in a busy period and calendar data was sent), clamped to 1-5; a VIP is raised to at least P4. Ambiguous dates count only after the user confirms them (`confirmed_deadlines`). |

## API

All endpoints except `/healthz` need the header `X-Internal-Key` matching
`CATEGORAIZE_INTERNAL_KEY`. Without that variable set, every request is
rejected (fail closed).

- `GET /healthz`: 503 while the model loads, 200 when ready.
- `POST /api/v1/embed` `{texts}` â†’ `{model, dimension, vectors}`
- `POST /api/v1/classify`: see `ClassifyRequest` / `ClassifyResponse` in `app/schemas.py`.
- `POST /api/v1/feedback` `{embedding, correct: {id, centroid}, incorrect?, alpha?, beta?}` â†’ updated centroids.

Errors: 401 bad or missing key, 422 invalid payload or an impossible
correction, 503 while the model loads.

## Run on Windows (PowerShell)

```powershell
. E:\categoraize\dev-env.ps1          # keeps pip and Hugging Face caches on E:
cd E:\categoraize\categoraize\fastapi_core
py -3.12 -m venv .venv                # 3.11 also works
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:CATEGORAIZE_INTERNAL_KEY = "<same value as the web app>"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

The first start downloads the model (about 470 MB) into `HF_HOME`.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

They cover acceptance scenarios 1, 2, 4 and 5, the scenario 3 path through
the regex baseline, the zero-vector and duplicate-feedback guards, auth, 503
and payload validation. They use the real model.

## Docker (CPU only)

```powershell
docker build -t categoraize-nlp .
docker run --rm -p 8000:8000 -e CATEGORAIZE_INTERNAL_KEY=... categoraize-nlp
```

The image bakes in the model weights, so it is large (about 2 GB).

## Tuning notes

`0.35` is the plan's starting threshold. With this model, short emails that
match score 0.33 to 0.45 against a one-sentence category description, and
some non-matching emails reach about 0.33. Borderline transactional emails
(a short bill notice) can therefore come back Uncategorized. The ranking is
still right, and one Rocchio correction moves the category over the
threshold (covered in the tests). Richer category descriptions help more
than lowering the threshold.

