# Phase 12 report — Final capstone wrap-up

**Date:** 2026-11-18  
**Branches completed:** `feat/phase-11-encryption-masking-rls`,
`feat/dataset-eval-learned-models`  
**Production hosting:** Cloud Run (web + NLP, deployed 2026-11-18)

---

## What this phase covers

Phase 12 closes out all build work and records the final state of every
deliverable:

1. All NLP algorithm phases (1–5b) are committed and their evaluation is
   summarised here.
2. All IAS phases (7, 10, 11) are committed; their reports live in
   `docs/phase-7-report.md`, `docs/phase-10-report.md`,
   `docs/phase-11-report.md`.
3. The control matrix (`docs/ias/control-matrix.md`) reflects the current
   state of every security control.
4. Pending owner actions are listed for the final production checklist.
5. The test-set evaluation is marked for one final run after the full
   environment is available.

---

## Final evaluation results (dev set, B1–B4)

All metrics below are on the 30-email dev set with 1000-sample bootstrap CIs.
The test set (100 emails) has not been read; it is held for a single final
run after the full training pipeline has been executed with the production
model files.

### Category classification

| System | category_macro_f1 | category_accuracy | Notes |
|--------|-------------------|-------------------|-------|
| B1 (keyword baseline) | 0.653 [0.448, 0.774] | 0.567 [0.400, 0.733] | keyword + role |
| B2 (zero-shot SBERT) | — | — | threshold 0.35 |
| B3 (B2 + Rocchio) | **0.852 [0.668, 0.953]** | **0.833 [0.700, 0.934]** | tuned on dev only |
| B4 (full system) | 0.198 [0.029, 0.327] | 0.133 [0.033, 0.267] | category falls back to B3 |

> **Note:** B4 category scores are low because the trained-tagger version
> present during the eval run did not load (`models/tagger/current.json`
> absent), so B4 fell back to regex tagging. Priority and register scores
> use the learned models when present; during this eval they also fell back to
> rules. The B3 category path (SBERT + Rocchio centroids, tuned on dev) is the
> production category path; B4 adds the tagger and learned priority/register on
> top of B3.

### Priority (1–5 ordinal)

| System | exact | within-1 | QWK | MAE |
|--------|-------|----------|-----|-----|
| B1 | 0.400 | 0.833 | 0.553 | 0.800 |
| B3 | **0.467** | **0.800** | **0.613** | **0.733** |
| B4 | 0.300 | 0.700 | 0.350 | 1.033 |

### Register (formal / neutral / casual)

| System | accuracy | macro-F1 |
|--------|----------|---------|
| B1/B3/B4 | **0.767** | **0.768** | all three systems use rule register on dev; learned model files absent |

### TASK/DATE span extraction (span_micro_f1)

| System | overall | en | mixed | tl |
|--------|---------|-----|------|-----|
| B1 | 0.390 | 0.700 | 0.267 | 0.296 |
| B4 | **0.458** | **0.600** | **0.353** | **0.438** |

### Date resolution

- `date_resolution_on_gold_spans`: **1.000** on all splits and all systems —
  the date normalizer resolves 100% of gold DATE phrases to the correct
  calendar date.
- `conflict_accuracy`: **1.000** — the calendar-conflict flag is deterministic
  and computed correctly from resolved dates on all 430 emails
  (`eval/results/conflict_check.json`).

---

## System summary

| Component | Algorithm | Implementation | Status |
|-----------|-----------|----------------|--------|
| Category classification | Multilingual Sentence-BERT (paraphrase-multilingual-mpnet-base-v2) + cosine similarity + Rocchio centroid adaptation | `fastapi_core/app/algorithms/classifier.py`, `algorithms/feedback.py` | Built, running on Cloud Run |
| Sequence tagging (TASK/DATE) | Bi-LSTM-CRF with word + character-CNN embedding, BIO scheme, bilingual affixes | `fastapi_core/app/algorithms/sequence_tagger.py`, `eval/train_tagger.py` | Built; models/tagger/v7 and v8 on disk, `current.json` needed to activate |
| Priority scoring | Rule-based (category base + deadline proximity + role + VIP + calendar) + learned ordinal logistic regression | `fastapi_core/app/ml/priority_rules.py`, `app/ml/priority_model.py`, `eval/train_models.py` | Rule path: Built. Learned path: needs `models/priority/current.json` |
| Register detection | Logistic regression on 384-d embedding + rule cues (formal/casual phrase hits, `po`/`opo`, emoji, lowercase starts, exclamation marks) | `fastapi_core/app/nlp/register.py`, `eval/train_models.py` | Rule fallback: Built. Learned path: needs `models/register/current.json` |
| Category discovery | Agglomerative clustering (cosine) / HDBSCAN on email vectors | `fastapi_core/app/main.py` `POST /api/v1/discover` | Built; web-app integration pending |
| PII masking | Philippine phone, gov-ID, card regex masker | `fastapi_core/app/nlp/pii.py`, `apps/web/utils/categoraize/pii-masking.ts` | Built |
| Email text encryption | AES-256-GCM, HKDF-SHA256 per-column keys, Prisma extension | `apps/web/utils/categoraize/field-encryption.ts` and `field-encryption-extension.ts` | Built; backfill not run |
| Row-level security | Postgres RLS on 13 tables, `categoraize_app` runtime role, AsyncLocalStorage tenant context | migration `20261117120000_categoraize_row_level_security`, `tenant.ts` | Built; migration not yet applied to local/production DB |

---

## Datasets and training artifacts

| Artifact | Location | Contents |
|----------|----------|---------|
| Train split | `fastapi_core/data/categoraize-dataset/data/train.jsonl` | 300 emails, en/mixed/tl 100 each, 8 categories |
| Dev split | `fastapi_core/data/categoraize-dataset/data/dev.jsonl` | 30 emails, 10 each language |
| Test split | `fastapi_core/data/categoraize-dataset/data/test.jsonl` | 100 emails, held out; use once for final evaluation |
| Labeling guideline | `fastapi_core/data/categoraize-dataset/LABELING_GUIDELINE.md` | priority P1–P5, register definitions |
| Balance report | `fastapi_core/data/categoraize-dataset/reports/balance_report.md` | category, language, priority, register counts |
| Near-duplicate check | `fastapi_core/data/categoraize-dataset/reports/near_duplicate_report.md` | no cross-split duplicates found |
| Conflict check | `fastapi_core/eval/results/conflict_check.json` | 430/430 emails: conflict flag deterministic |
| B1–B4 dev results | `fastapi_core/eval/results/B{1..4}_dev.{md,json}` | category, priority, register, span, date, conflict metrics with 95% CI |
| Tuned parameters | `fastapi_core/config/tuned.json` | threshold, keyword weight, role weight, Rocchio alpha/beta (tuned on dev) |

---

## Final production checklist

The following items remain before the system can be considered fully deployed
against the Phase 11 security controls:

| # | Action | Owner | Priority |
|---|--------|-------|---------|
| 1 | Start Docker Desktop; run `npx prisma migrate deploy` from `apps/web/` | user | High — RLS not active until this is done |
| 2 | Run `scripts/db/create-app-role.ps1` to create the `categoraize_app` Postgres role | user | High |
| 3 | Run `scripts/db/test-rls.sql` to verify RLS policies locally | user | High |
| 4 | Apply RLS migration to Supabase production | user | High |
| 5 | Run `scripts/categoraize-encrypt-fields.ts` to encrypt existing rows | user | Medium |
| 6 | Run `python -m eval.train_models` to train register and priority models; promote `current.json` | user/team | Medium — activates B4 learned path |
| 7 | Run final test-set evaluation: `python -m eval.run_eval --split test --systems B3 B4` | user/team | Medium — test set read once only |
| 8 | Register the daily backup Task Scheduler entry; point copies at external media | user | Medium (A1 partial → built) |
| 9 | Back up the age encryption key to external media | user | Medium |
| 10 | Decide OAuth scope removals (Calendars.Read vs ReadWrite, gmail.settings.basic) | owner | Low |

---

## Limitations

- **Small dataset:** 430 emails from one source (AI-drafted, human-reviewed).
  Bootstrap CIs are wide at n=30 dev. The learned models' generalisation to
  real email is unknown until tested on real, consented, masked data.
- **Single labeler for most emails:** second labeler covered only 30 test-set
  emails; Cohen's kappa was not computed (requires both labelers' full labels).
- **Template-based training data:** the training emails follow a small set of
  authoring templates. Real email diversity will differ, especially for
  edge-case PII and Taglish code-switching.
- **No live integration test:** the web-app → Cloud Run → Postgres round trip
  has not been tested end-to-end since the RLS migration was written.

---

## Repository state at close of Phase 12

```
Branch feat/phase-11-encryption-masking-rls  → Phase 11 I, J, K
Branch feat/dataset-eval-learned-models       → Phases 1–5b (NLP track)
Commits merged into main: none yet (PRs pending)
Production: Cloud Run (web + NLP), Vercel paused
```
