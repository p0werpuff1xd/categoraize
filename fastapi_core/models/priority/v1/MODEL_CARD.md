# Learned priority v1 model card

Multinomial logistic regression (scikit-learn, L2), stored as JSON in `model.json`. Features: embedding, sender role (one-hot), is_vip, has_task, deadline proximity (0 if none or ambiguous, 1 if due now, 0 at one week), similarity to the promotions description, register.

## Data

- Fit: data/categoraize-dataset/data/train.jsonl (300, template-synthetic). C chosen on dev.jsonl (30).
- Fictional emails only; never trained on real users' mail (Google Limited Use).
- Labels are AI-authored (`human_reviewed=false`), pending second-labeler kappa and native-speaker review.
- Train is template-synthetic: priority and register are fixed per template, so the model can learn
  template shortcuts; dev/test scores overstate real-mail performance.

## Dev selection (seed 7, embedding paraphrase-multilingual-MiniLM-L12-v2)

| C | dev_qwk | dev_exact | dev_within1 | dev_mae |
|---|---|---|---|---|
| 0.01 | 0.499 | 0.4667 | 0.8 | 0.7333 |
| 0.03 | 0.5492 | 0.5333 | 0.8333 | 0.6333 |
| 0.1 | 0.5628 | 0.5333 | 0.8333 | 0.6333 |
| 0.3 | 0.6053 | 0.5667 | 0.8333 | 0.6 |
| 1.0 | 0.6053 | 0.5667 | 0.8333 | 0.6 |
| 3.0 | 0.5885 | 0.5333 | 0.8333 | 0.6333 |
| 10.0 | 0.5338 | 0.5333 | 0.8333 | 0.6667 |
| 30.0 | 0.5826 | 0.5667 | 0.8667 | 0.6 |
| 100.0 | 0.583 | 0.5333 | 0.8667 | 0.6333 |

Chosen C = 0.3. Rule baseline on dev: dev_qwk 0.5351, dev_exact 0.4333, dev_within1 0.7667, dev_mae 0.8.
Promoted to current: **yes** (rule: not below the rule baseline on dev).

## Guardrails and fallback

After the model: a VIP sender with a TASK is at least P4; promotions are capped at P2; a manual override wins. Calendar data is not a feature, so it never lowers priority. Without the model file the service uses the deterministic rules (app/ml/priority_rules.py).

Test results: see eval/RESULTS.md (B4).
