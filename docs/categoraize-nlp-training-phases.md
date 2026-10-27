# CategorAIze NLP Training Phases

This document records how the three NLP algorithms are trained and integrated
with the website chatbot.

## Current behavior

| Algorithm | Current training behavior | Chatbot usage |
| --- | --- | --- |
| SBERT | Uses the pretrained multilingual model. No project-specific training is required initially. | Compares an email with the user’s category descriptions. |
| Passive-Aggressive classifier | Learns incrementally from explicit, verified user category corrections. | Personalizes category predictions for each user. |
| BiLSTM-CRF | Does not train automatically. FastAPI only loads a manually trained checkpoint when one exists. | Extracts `ACTION` and `DEADLINE` entities from email text. |

The chatbot must never treat raw conversations or unconfirmed suggestions as
training data.

## Incremental training phase

The BiLSTM-CRF model will be trained offline through this workflow:

```text
Collect de-identified examples
        ↓
Manually annotate actions and deadlines
        ↓
Validate BIO labels
        ↓
Split into training and validation data
        ↓
Train with PyTorch
        ↓
Evaluate precision, recall, and F1
        ↓
Save bilstm-crf.pt
        ↓
FastAPI loads the checkpoint for inference
```

Example annotation:

```json
{
  "tokens": ["Please", "submit", "the", "report", "by", "Friday"],
  "labels": ["O", "B-ACTION", "I-ACTION", "I-ACTION", "O", "B-DEADLINE"]
}
```

The supported labels are:

- `O`
- `B-ACTION`
- `I-ACTION`
- `B-DEADLINE`
- `I-DEADLINE`

The trained checkpoint will be stored locally at:

```text
services/nlp/models/bilstm-crf.pt
```

Until a valid checkpoint is available, the API returns
`bilstm_crf.status = "unavailable"`. It must not fabricate entity results.

## Planned training tooling

The incremental phase should add:

```text
services/nlp/data/ner.jsonl
services/nlp/scripts/validate_ner_data.py
services/nlp/scripts/train_bilstm_crf.py
services/nlp/scripts/evaluate_bilstm_crf.py
```

The initial example fixtures are for testing only and are not sufficient to
train a reliable production model. Training data must be de-identified and
approved before it is used.

## Future automation

Later, approved annotations and explicit user corrections may feed a scheduled
retraining pipeline. That pipeline must include:

1. Data approval and de-identification.
2. A reproducible training run.
3. Validation against a held-out dataset.
4. A minimum quality threshold.
5. Versioned checkpoint promotion and rollback.

Automatic retraining from raw email text, raw chatbot messages, or unconfirmed
predictions is not allowed.
