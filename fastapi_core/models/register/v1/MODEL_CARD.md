# Learned register v1 model card

Multinomial logistic regression (scikit-learn, L2), stored as JSON in `model.json`. Features: the 384-d email embedding and the rule cues formal_hits, casual_hits, has_po, emoji, lowercase_starts, exclamations.

## Data

- Fit: data/categoraize-dataset/data/train.jsonl (300, template-synthetic). C chosen on dev.jsonl (30).
- Fictional emails only; never trained on real users' mail (Google Limited Use).
- Labels are AI-authored (`human_reviewed=false`), pending second-labeler kappa and native-speaker review.
- Train is template-synthetic: priority and register are fixed per template, so the model can learn
  template shortcuts; dev/test scores overstate real-mail performance.

## Dev selection (seed 7, embedding paraphrase-multilingual-MiniLM-L12-v2)

| C | dev_macro_f1 | dev_accuracy |
|---|---|---|
| 0.01 | 0.4499 | 0.5667 |
| 0.03 | 0.4499 | 0.5667 |
| 0.1 | 0.6407 | 0.6667 |
| 0.3 | 0.7299 | 0.7333 |
| 1.0 | 0.7299 | 0.7333 |
| 3.0 | 0.6921 | 0.7 |
| 10.0 | 0.774 | 0.7667 |
| 30.0 | 0.774 | 0.7667 |
| 100.0 | 0.8125 | 0.8 |

Chosen C = 100.0. Rule baseline on dev: dev_macro_f1 0.7685, dev_accuracy 0.7667.
Promoted to current: **yes** (rule: not below the rule baseline on dev).

## Guardrails and fallback

When the model file is missing the service uses the rule cue detector (app/nlp/register.py).

Test results: see eval/RESULTS.md (B4).
