# CategorAIze NLP Incremental Implementation Plan

This roadmap defines the staged implementation of the NLP algorithms and their
integration with the chatbot and website. Each phase should remain usable on
its own and must not introduce features outside the approved PRD.

## Phase 1: FastAPI NLP foundation

Status: implemented in the local service.

- Run FastAPI as a separate service from Next.js.
- Keep email-provider access and authentication in Next.js.
- Expose server-to-server `/api/v1/analyze` and `/api/v1/feedback` endpoints.
- Return explicit `ready` or `unavailable` statuses for each algorithm.
- Use pretrained multilingual SBERT for initial category similarity.
- Keep BiLSTM-CRF unavailable until a valid checkpoint is trained.
- Never fabricate predictions when a model is unavailable.

## Phase 2: Chatbot integration

Status: implemented at the server tool layer.

- Add `analyzeEmail` to the chatbot’s server-side tools.
- Add `correctEmailCategory` for explicit user corrections.
- Let the chatbot report SBERT, Passive-Aggressive, and BiLSTM-CRF results
  separately.
- Keep the NLP service token server-only.
- Do not let the NLP service access Gmail, Outlook, or the browser directly.

## Phase 3: Passive-Aggressive feedback UI

Status: planned.

Add a small feedback control wherever an NLP category prediction is displayed:

```text
Predicted category: Finance

[Correct category ▼] [Save correction]
```

Required behavior:

1. Show the current predicted category.
2. Let the user choose from existing categories only.
3. Submit the correction to `/api/v1/feedback` through the Next.js server.
4. Show a clear success or failure state.
5. Do not change the email label, archive state, or folder automatically.
6. Do not train from dismissed, ambiguous, or unconfirmed suggestions.

The chatbot may also accept a direct correction such as “This belongs in
Personal,” but it must call the feedback tool only when the user clearly means
to correct the prediction.

## Phase 4: Passive-Aggressive persistence

Status: planned.

- Persist verified feedback and model state in Supabase PostgreSQL.
- Scope each model to the authenticated user.
- Restore the model after FastAPI restarts.
- Keep a model version and verified-example count.
- Prevent category-set changes from silently corrupting an existing model.
- Add idempotency for repeated feedback submissions.

## Phase 5: BiLSTM-CRF annotation and training

Status: planned.

Create a de-identified BIO annotation dataset for actions and deadlines:

```json
{
  "tokens": ["Please", "submit", "the", "report", "by", "Friday"],
  "labels": ["O", "B-ACTION", "I-ACTION", "I-ACTION", "O", "B-DEADLINE"]
}
```

Add these tools:

```text
services/nlp/data/ner.jsonl
services/nlp/scripts/validate_ner_data.py
services/nlp/scripts/train_bilstm_crf.py
services/nlp/scripts/evaluate_bilstm_crf.py
```

Training must be offline and reproducible. The checkpoint must be evaluated
before being placed at:

```text
services/nlp/models/bilstm-crf.pt
```

## Phase 6: NLP result presentation

Status: planned.

Display the outputs without mixing their responsibilities:

- Category prediction from SBERT or a ready Passive-Aggressive model.
- Extracted `ACTION` entities from BiLSTM-CRF.
- Extracted `DEADLINE` entities from BiLSTM-CRF.
- Priority and explanation from the priority resolver.
- Clear unavailable states when a model is not ready.

The chatbot can summarize these results, but it must not claim that an
unavailable algorithm produced a prediction.

## Phase 7: Controlled retraining automation

Status: future.

Only approved, de-identified annotations and explicit user corrections may be
used for scheduled retraining. Any automated pipeline must include:

1. Data approval and privacy review.
2. Dataset versioning.
3. A held-out evaluation set.
4. Minimum precision, recall, and F1 thresholds.
5. Versioned checkpoint promotion and rollback.

Raw email text, raw chatbot messages, and unconfirmed model outputs must not be
used as automatic training data.
