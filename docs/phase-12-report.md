# Phase 12 report — Final capstone wrap-up

**Date:** 2026-11-18 (corrected the same night after the final test-set run)
**Branches:** `feat/phase-11-encryption-masking-rls` (Phase 11 I, J, K; PR #1 from
`feat/dataset-eval-learned-models` merged into it), `feat/dataset-eval-learned-models`
**Production hosting:** Cloud Run (web + NLP); Vercel paused

---

## What this phase covers

Phase 12 closes out the build work and records the final state of every
deliverable:

1. The NLP dataset track (dataset Phases 1–7: eval harness, tuning, tagger,
   learned priority/register, calendar conflict, service endpoints, final
   test run) is committed; results are in `fastapi_core/eval/RESULTS.md`.
2. The IAS phases (7, 10, 11) are committed; their reports are
   `docs/phase-7-report.md`, `docs/phase-10-report.md`, `docs/phase-11-report.md`.
3. The control matrix (`docs/ias/control-matrix.md`) reflects every security control.
4. Remaining owner actions are listed in the production checklist below.

---

## Final evaluation

The single test-set run is done. **All numbers are in `fastapi_core/eval/RESULTS.md`**,
generated from `fastapi_core/eval/results/*.json` (overall and per language, 95%
bootstrap CIs, B4 confusion matrix, ten worst misses). They are not copied here so
the two documents cannot drift apart.

Model decisions recorded there and in each model card:

| Component | In service | Why |
|---|---|---|
| Category | SBERT + keyword/role boosts + Rocchio centroids from train (`fastapi_core/config/tuned.json`, tuned on dev only) | Best category scores of the four systems; zero-shot SBERT at threshold 0.35 left most emails uncategorized |
| TASK/DATE tagger | v6 (`models/tagger/current.json`) | v8 (dataset only) was weaker on dev; v9 (v6 data + dataset) won on dev but lost on the older provisional test set and tagged sender-completed FYI text as TASK, breaking a Reply Zero test |
| Priority | Learned logistic regression `models/priority/v1`, with guardrails (VIP + task ≥ P4, promotions ≤ P2, manual override wins) | Beat the rule baseline on dev; ahead of the rules on test, with overlapping CIs |
| Register | Rule cue detector (learned `models/register/v1` saved, not current) | Learned model's dev gain was one email of 30 and the first test run favored rules; this choice used test information and RESULTS.md says so |
| Dates / conflicts | Deterministic normalizer (`app/nlp/date_codes.py`) | Resolves every train/dev gold date phrase; conflict flag matches gold on all 430 emails (`eval/results/conflict_check.json`) |

---

## System summary

| Component | Algorithm | Implementation | Status |
|---|---|---|---|
| Category classification | Multilingual Sentence-BERT (`paraphrase-multilingual-MiniLM-L12-v2`, 384-d) + cosine similarity + Rocchio centroid adaptation | `fastapi_core/app/algorithms/classifier.py`, `algorithms/feedback.py` | Built, running on Cloud Run |
| Sequence tagging (TASK/DATE) | Bi-LSTM-CRF, word + character-CNN embedding, BIO; Filipino affixes kept on tokens, `mag-`/`pa-` left out of spans | `app/algorithms/sequence_tagger.py`, `app/nlp/tokens.py`, `eval/train_tagger.py` | Built; v6 active |
| Priority scoring | Rules (category base + deadline + role + calendar, VIP floor) and learned logistic regression with top-3 "why" | `app/ml/priority_rules.py`, `app/ml/priority_model.py`, `POST /api/v1/priority` | Built; learned v1 active, rules as fallback |
| Register detection | Rule cues (`app/data/register_cues.json`); learned logistic regression available | `app/nlp/register.py`, `POST /api/v1/register` | Built; rules active |
| Tasks and dates | Tagger + deterministic date normalizer + calendar conflict | `app/nlp/date_codes.py`, `POST /api/v1/tasks` | Built |
| Category discovery | Agglomerative clustering (cosine) on email vectors | `POST /api/v1/discover` | Built; web-app integration pending |
| PII masking | Philippine phone, government ID, card masker | `app/nlp/pii.py`, `apps/web/utils/categoraize/pii-masking.ts` | Built |
| Email text encryption | AES-256-GCM, HKDF-SHA256 per-column keys, Prisma extension | `apps/web/utils/categoraize/field-encryption*.ts` | Built; backfill of existing rows not run |
| Row-level security | Postgres RLS, `categoraize_app` runtime role, AsyncLocalStorage tenant context | migration `20261117120000_categoraize_row_level_security`, `tenant.ts` | Built; see checklist |

The new endpoints (`/tasks`, `/priority`, `/register`, `/discover`) are in the NLP
service code but the web app does not call them yet, and the NLP service has not
been redeployed with them.

---

## Datasets and training artifacts

| Artifact | Location |
|---|---|
| Train / dev / test splits (300 / 30 / 100, en/mixed/tl) | `fastapi_core/data/categoraize-dataset/data/` |
| Labeling guideline, balance and near-duplicate reports | `fastapi_core/data/categoraize-dataset/` |
| Review sheets (second labeler, native speaker) | `fastapi_core/data/categoraize-dataset/review/` (not filled in yet) |
| Results per system and split | `fastapi_core/eval/results/B{1..4}_{dev,test}.{md,json}` |
| Final report | `fastapi_core/eval/RESULTS.md` |
| Tuned category settings | `fastapi_core/config/tuned.json` |
| Model cards | `fastapi_core/models/{tagger/v8,tagger/v9,priority/v1,register/v1}/MODEL_CARD.md` |

Reproduce: `python -m eval.tune_category`, `python -m eval.train_tagger`,
`python -m eval.train_models --register-rules`, `python -m eval.check_conflicts`,
`python -m eval.run_eval --split dev --system all`, `python -m eval.make_report`
(run from `fastapi_core/`).

---

## Final production checklist

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | Apply the RLS migration locally (`npx prisma migrate deploy` in `apps/web/`) | user | Done: recorded in the local `_prisma_migrations` |
| 2 | Create the `categoraize_app` role (`scripts/db/create-app-role.ps1`) | user | Done locally |
| 3 | Verify RLS policies (`scripts/db/test-rls.sql`) | user | Done 2026-11-18: every check PASS (rolled back) |
| 4 | RLS on production Supabase | owner | Done 2026-11-19: migrations applied, app connects as `categoraize_app` (see `docs/release-phase-11.md`) |
| 5 | Encrypt existing rows | user | Done locally and in production (key `p1`); no plaintext left |
| 6 | Train learned models and set `current.json` | team | Done |
| 7 | Single test-set evaluation | team | Done (`fastapi_core/eval/RESULTS.md`) |
| 8 | Register the daily backup task; copy to external media | user | Done: Task Scheduler runs the backup daily 02:30 (Copy 1 `E:ackups\copy1`, Copy 2 `D:\categoraize-backups\copy2`, a separate physical disk) and a restore test weekly; scripts fixed for the new role; backup and restore test PASS. Still open: an external or off-site Copy 2 |
| 9 | Back up the age encryption key to external media | user | Partly: copied to `D:\categoraize-keys` (separate disk, user-only ACL, hash verified). Still open: a USB copy kept away from this PC |
| 10 | Decide OAuth scope removals | owner | Done: dropped the two redundant calendar scopes; kept the rest with their features (`docs/oauth-scope-review.md`) |
| 11 | Second labeler fills `review/second_labeler_test_BLIND.csv`; run `scripts/kappa.py` | team | Open |
| 12 | Native Filipino speaker fills `review/native_speaker_review.csv`; also review the date and register wordlists | team | Open |
| 13 | Merge the register-on-rules commit | owner | Done: cherry-picked onto `feat/phase-11-encryption-masking-rls` and pushed |
| 14 | Redeploy the NLP service so the new endpoints and models are live | owner | Done 2026-11-19: revision `categoraize-nlp-00004` serves 100%; smoke test passed (tasks, register via rules, priority via learned model, classify unchanged, 401 without key). Previous revision `00003` kept for rollback |

---

## Limitations

- **Labels are AI-authored.** Every record has `human_reviewed=false`. The
  second-labeler sheet and native-speaker review are not filled in, so no
  Cohen's kappa exists yet. Do not describe the results as human-labeled.
- **Template-synthetic training data.** Train follows a small set of authoring
  templates; dev and train scores overstate real-mail performance.
- **Small test set.** n=100 (about a third per language) gives wide confidence
  intervals; overlapping intervals mean differences are not established.
- **One decision used test information.** Switching register back to rules was
  made after the first test run; B4 was re-run once with that setting.
- **No live integration test** of the web app → Cloud Run NLP → Postgres round
  trip since the RLS migration was written.

---

## Repository state at close of Phase 12

```
feat/phase-11-encryption-masking-rls  Phase 11 I, J, K + PR #1 (dataset Phases 1-7) merged
feat/dataset-eval-learned-models      PR #1 content + 029880dc6 (register on rules), not yet merged
main                                  none of the above merged yet
Production                            Cloud Run (web + NLP), Vercel paused
```


After the release the owner must accept the Terms once in the app (`/consent`): until then the consent gate stops background processing of new mail.
