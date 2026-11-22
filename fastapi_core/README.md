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
| TASK/DATE spans | `app/algorithms/sequence_tagger.py`, `app/services/tagger.py` | Bi-LSTM-CRF with BIO tags (see "Task and date tagger" below), loaded from `models/tagger/<current>`. Falls back to the regex baseline (`app/nlp/regex_tagger.py`) when no trained model is present or `CATEGORAIZE_TAGGER=regex`. Each span says which one produced it (`tagger: "bilstm_crf"` or `"regex"`); `/healthz` shows the active tagger and version. |
| Date resolution | `app/nlp/extractor.py` | Resolves against `received_at` in the user's timezone. Date-only phrases default to 17:00. Vague phrases (`mamaya`, `next Friday`, `3/4`) are flagged `ambiguous`. |
| Taglish normalizer | `app/nlp/taglish_cleaner.py`, `app/data/taglish_lexicon.json` | Dictionary of about 200 entries: `paki-` requests, particles, time words, weekdays, months. |
| Language ID | `app/nlp/language.py` | `en`, `tl`, `mixed` or `unknown`: lexicon rules first, `langdetect` as fallback. |
| Priority P1-P5 | `app/ml/priority_rules.py` | Deterministic rules (plan section 7): category base + deadline (+2 within 24 h or overdue, +1 within 72 h) + role (Director/Executive +2, Manager +1) + calendar (+1 when the deadline is in a busy period and calendar data was sent), clamped to 1-5; a VIP is raised to at least P4. Ambiguous dates count only after the user confirms them (`confirmed_deadlines`). |

## API

All endpoints except `/healthz` need the header `X-Internal-Key` matching
`CATEGORAIZE_INTERNAL_KEY`. Without that variable set, every request is
rejected (fail closed).

- `GET /healthz`: 503 while the model loads, 200 when ready.
- `POST /api/v1/embed` `{texts}` → `{model, dimension, vectors}`
- `POST /api/v1/classify`: see `ClassifyRequest` / `ClassifyResponse` in `app/schemas.py`.
- `POST /api/v1/feedback` `{embedding, correct: {id, centroid}, incorrect?, alpha?, beta?}` → updated centroids.
- `POST /api/v1/match` `{subject, body, candidates: [{id, text?, centroid?}], threshold?}` →
  `{ranked, best, threshold, embedding, has_task}`. Zero-shot Sentence-BERT match of
  an email (or a sender) against free-text descriptions. The web app uses it for
  rule matching, cold-email detection and sender categories. `has_task` says
  whether the TASK/DATE tagger found a request.
- `POST /api/v1/choose-rule` `{subject, body, rules: [{id, name, instructions, reply_needed, system_type?}], allow_multiple}` →
  `{ranked, matched, confident, reasons, has_request, params}`. Rule matching with a
  confidence verdict (local first; the web app escalates unsure emails to the
  external LLM only with consent). Settings: `app/data/matching_params.json`.
- `POST /api/v1/thread-status` `{messages: [{from_user, subject, body, automated}]}` →
  `{status, confident, reason, signals}`. Reply Zero status from tagger signals.
- `POST /api/v1/summarize` `{subject?, body, max_sentences?}` → `{sentences}`.
  Extractive: up to N original sentences, ranked by similarity to the email's
  Sentence-BERT centroid, with a small boost for sentences with a request or a date.

Errors: 401 bad or missing key, 411 POST without Content-Length, 413 payload
over the size limit, 422 invalid payload or an impossible correction, 429 rate
limit (with `Retry-After`), 503 while the model loads.

### Hardening (`app/security.py`)

| Setting | Default | Notes |
| --- | --- | --- |
| `CATEGORAIZE_MAX_BODY_BYTES` | 4194304 (4 MB) | Enough for 200 label centroids. |
| `CATEGORAIZE_RATE_LIMIT_PER_MINUTE` | 1200 | Per client address, sliding 60 s window, in memory; `0` turns it off. `/healthz` is exempt. |

- The key check uses `secrets.compare_digest` and fails closed when
  `CATEGORAIZE_INTERNAL_KEY` is unset. Failed checks are counted
  (`auth_failures` on `/healthz`) and logged without the presented key.
- No CORS middleware: browsers cannot call the service; only the web app's
  server does.
- Request bodies and email text are never logged (tested in
  `tests/test_hardening.py`).
- Uvicorn binds to 127.0.0.1 by default. Only the container image binds to
  0.0.0.0, because Cloud Run needs it; there the internal key protects it.

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

They cover acceptance scenarios 1 to 5 (scenario 3 through both the
Bi-LSTM-CRF and the regex fallback), tokenization and markup, a small
train/save/load run, the zero-vector and duplicate-feedback guards, auth, 503
and payload validation. They use the real Sentence-BERT model and the current
tagger version.

## Task and date tagger (Bi-LSTM-CRF)

**Model** (`app/algorithms/sequence_tagger.py`):
- Each token is a word embedding (lowercased, digits folded to 0), plus a
  character CNN over its letters, which catches `paki-`/`pa-`/`i-` forms and
  Taglish spellings, plus a casing feature.
- A BiLSTM reads each sentence, and a CRF (`pytorch-crf`) picks the tag
  sequence with Viterbi decoding.
- Tags are `O`, `B-TASK`, `I-TASK`, `B-DATE`, `I-DATE`.
- About 0.7 MB per version; CPU inference takes about 5 ms per email.

**Training data** (`training/`, offline only):
- About 2,000 synthetic English, Filipino and Taglish emails built from
  templates with task, date and filler slots (`training/synthetic.py`), so the
  labels are exact.
- Plus team-written examples in `data/team/` and `data/corrected/`.
- Never real users' Gmail data or their in-app corrections (Google API
  Limited Use). The loader refuses files outside `data/`.
- Labeling rules: `data/README.md`.

**Commands** (from `fastapi_core`, with the venv's python):

```powershell
python -m training.generate_synthetic                       # data/synthetic/{train,dev}.jsonl
python -m training.convert_markup data/test/hand_labeled.md # check your test file, show BIO tags
python -m training.retrain                                  # train next version, promote if F1 does not drop
python -m training.evaluate                                 # score current version and regex on the test set
python -m training.evaluate --version v3 --file data/test/holdout_claude.md
```

**How `retrain.py` decides:**
- It trains the next version, then scores it and the current version on the
  same fixed test set: `data/test/hand_labeled.md`, or
  `data/test/provisional_claude.md` until that file has emails.
- It promotes the new version (updates `models/tagger/current.json`) only if
  entity F1 does not drop.
- Every version is kept, with its `metrics.json`.
- The service loads the promoted version on its next restart, and never
  changes weights while serving.

**Results so far.** Entity-level exact-match F1, against the regex baseline:

| Version | Synthetic dev | Provisional set (45 emails) | Held-out set (30 emails) |
| --- | --- | --- | --- |
| Regex baseline | n/a | 0.830 | 0.767 |
| v1 | 0.988 | 0.641 | 0.518 |
| v2 | 0.969 | 0.939 | 0.792 |
| v3 | 0.993 | 0.940 | 0.775 |
| v4 | n/a | 0.981 | 0.765 |
| v5 | 1.000 | 0.981 | 0.828 |
| v6 (current) | 0.997 | 0.988 | **0.863** |

v6 adds 1,263 LLM-written emails (`data/llm`, English/Filipino/Taglish from a
free OpenRouter model) to the 5,000 template emails. On the LLM-written
holdout (142 emails never trained on) it scores entity F1 0.858 against 0.655
for the regex baseline; Filipino on the hand-written held-out set rose to
0.875.

v5 comes from `python -m training.tune_tagger`, a grid search over 16 settings
(training size 2,000/5,000, hidden 128/256, dropout 0.3/0.5, 12/20 epochs). The
best on the provisional set was 5,000 emails, hidden 128, dropout 0.5. It also
added "please welcome…" style non-request sentences. On the held-out set it is
the first version above the regex baseline in every language (Filipino 0.788 vs
0.759).

## Rule matching and Reply Zero (cascade)

`python -m training.eval_matching --test` builds the learned rule centroids,
tunes the settings and reports scores:

1. **Learned centroids:** averaged over 80% of the LLM-written rule emails
   (`data/llm/rules.jsonl`), one per built-in rule plus "NONE", overall and per
   language. They are saved to `app/data/rule_prototypes.json`.
2. **Tuning:** the settings are tuned on that same 80%.
3. **Scoring:** the other 20% is an LLM holdout, and the hand-written sets in
   `data/matching` (a different author) are the test.

Custom rules and edited built-in rules never use the centroids, only the
user's wording.

| Rule matching (default Inbox Zero rules) | Descriptions only | With learned centroids |
| --- | --- | --- |
| Hand-written test, local only | 0.604 | **0.792** (en 0.875, Taglish 0.844, Filipino 0.656) |
| LLM holdout, local only | 0.544 | **0.824** |
| Confident (local) answers: accuracy | 0.830 | **0.941** (53% of test emails) |
| If the external AI got every unsure email right | 0.906 | **0.969** |

Reply Zero status: **0.917** on the hand-written test, 0.923 on the LLM holdout.

How to read these numbers:
- The hand-written test was scored three times during this work (before the
  centroids, with overall centroids, then per-language ones), so it is no
  longer fully untouched.
- On it, the confidence cut-off tuned on LLM emails flags more emails as
  unsure (47%) than on LLM data (about 25%).
- With external AI off, the unsure emails still get the local answer.
- Filipino remains the weakest language.
