# Tagger v9 model card

Bi-LSTM-CRF that tags TASK and DATE spans (BIO) in email bodies; DATE spans are resolved
deterministically by `app/nlp/date_codes.py`.

## Data

- Train: data/categoraize-dataset/data/train.jsonl (300, template-synthetic, bodies only) x5 plus 9014 older tagger examples (generated synthetic, team-written, LLM-written; v6 recipe; no real user mail). Fictional; no real user mail (Google Limited Use).
- Early stopping: dev.jsonl (30, hand-written), best epoch by entity F1.
- Labels are AI-authored (`human_reviewed=false`), pending second-labeler kappa and native-speaker review.
- Train is template-synthetic, so dev/test scores overstate performance on real mail.

## Training

- Seed 13, 12 epochs, best epoch 9, trained 2026-11-18T10:20:02+00:00.
- Architecture: word embedding + character CNN + casing feature, BiLSTM, CRF. Config: `{'word_dim': 100, 'char_dim': 30, 'char_filters': 50, 'casing_dim': 4, 'hidden': 128, 'dropout': 0.5, 'max_word_chars': 24}`.
- Tokenizer keeps Filipino hyphenated forms (i-submit, paki-send, mag-Friday) as one token; a leading
  `mag-` (DATE) or `pa-` (TASK) is left out of the span when decoding, as in the labeling guideline.

## Dev span F1 (exact offsets)

| scope | TASK F1 | DATE F1 | micro F1 |
|---|---|---|---|
| overall | 0.465 | 0.545 | 0.506 |
| en | 0.364 | 0.933 | 0.692 |
| mixed | 0.353 | 0.267 | 0.312 |
| tl | 0.667 | 0.429 | 0.552 |

Previous version v6 on the same dev set:

| scope | TASK F1 | DATE F1 | micro F1 |
|---|---|---|---|
| overall | 0.478 | 0.440 | 0.458 |
| en | 0.308 | 0.824 | 0.600 |
| mixed | 0.444 | 0.250 | 0.353 |
| tl | 0.667 | 0.235 | 0.438 |

Promoted to current: **no** (rule: promote only if dev micro F1 does not drop).

## Why not promoted

Dev span F1 rose (0.506 vs 0.458, 41 spans) but v9 scored lower than v6 on the older provisional test set (0.945 vs 0.988), equal on the LLM holdout (0.854 vs 0.850), and tags sender-completed FYI statements as TASK (breaks tests/test_thread_status.py, which feeds Reply Zero). v6 stays current.

## Test (run once, see eval/RESULTS.md)

Not yet run.

## Review flags

- The Filipino/Taglish date wordlist in `app/nlp/date_codes.py` (bukas, mamaya, ngayon, Lunes..Linggo,
  alas-dos ng hapon, Disyembre 5, katapusan ng araw, ...) needs native-speaker review.
