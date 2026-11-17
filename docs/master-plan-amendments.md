# Master plan amendments

Additions to the CategorAIze master implementation plan, recorded as given by
the project owner. Each amendment says which part of the plan it changes.

## 2026-11-17: supporting learned models, own dataset, category discovery

**Section 2 (final decisions), add this bullet:**

- Supporting learned models (not counted algorithms): (1) a learned priority
  model, (2) a learned register classifier, (3) category discovery by
  clustering. They are trained or tuned ONLY on our own dataset (fictional
  emails written by the team and classmates or generated from templates,
  always human-reviewed), never on real users' Gmail-derived data. Rules stay
  as the baseline and the fallback. Sentence-BERT stays pretrained (do not
  fine-tune). Per-user adaptation is small per-category and per-sender
  priority offsets stored under that user's own account, never pooled.

**Phase 5, replace the first bullet (data) with:**

- Our own dataset (`data/categoraize/`, JSONL, all fictional): splits train
  (about 300), dev (30), test (100). The test set is written separately from
  the training templates, by different authors where possible, and is used
  once at the end. Balance en / tl / mixed. LLM-assisted drafting through
  OpenRouter is allowed for fictional content only, with every email
  human-reviewed. Fields: id, split, source (synthetic | team | classmate),
  language, subject, body, sender_role, is_vip, received_at, gold_category (a
  fixed set of about 8 categories with descriptions), gold_spans,
  gold_priority (1-5), gold_register (formal | neutral | casual),
  gold_calendar_conflict (bool). gold_priority and gold_register must be
  labeled by humans independently of our rules, never computed from them.
  Provide: a small local labeling tool (CLI or page), a labeling guideline doc
  (what P1-P5 mean; definitions of formal, neutral, casual), a validator, a
  class-balance report, a near-duplicate check between splits, and an
  inter-annotator check on 30 emails with Cohen's kappa if a second labeler
  exists.

**Add Phase 5b: train the supporting models** (offline only; scripts
`train_priority.py`, `train_register.py`; models versioned in
`fastapi_core/models/`, promoted only if the dev metric does not drop; the
service loads them at startup; fall back to rules when a model is missing).

- Learned priority: features are category base priority, hours to the
  validated deadline (clipped), has_deadline, deadline_ambiguous, sender role,
  is_vip, calendar_conflict, and semantic urgency. Use ordinal or multinomial
  logistic regression (scikit-learn) with L2 regularization chosen by
  cross-validation on train+dev, initialized near the rule weights. Keep it
  explainable: show each factor's contribution from the coefficients in the
  "Why this priority" panel, labeled "learned weights". Return
  `priority.source = learned | rules`. Apply per-user offsets after the model.
- Learned register: logistic regression on the 384-d embedding plus the rule
  cues as features; fall back to the rule detector.
- Category discovery: add `POST /api/v1/discover`. Request
  `{vectors: [{id, vector}], min_cluster_size}`; response
  `{clusters: [{cluster_id, member_ids, centroid[384], cohesion}], noise_ids}`.
  The web app sends only IDs and vectors, never text. Cluster the user's
  Uncategorized emails (HDBSCAN or agglomerative clustering with cosine
  distance). The web app derives candidate names from top terms in that
  user's own emails and the nearest curated template. The user confirms,
  renames, merges or dismisses; a confirmed cluster becomes a category
  initialized with its centroid. Never create a category automatically.
- Extend `run_eval.py`: learned vs rule metrics for priority (exact match,
  within-one, MAE) and register accuracy, overall and by language tag;
  discovery metrics (ARI, NMI, purity) and a held-out-category recovery test
  (remove one gold category from the seeded set and check whether discovery
  groups its emails together). Fixed seed, bootstrap confidence intervals, and
  a limitations section (small n, human labels from one or few labelers,
  template-based training data).

**Section 8 (UI states), add:**

- Suggested categories screen: not enough emails yet, computing, clusters with
  sample emails, accept / rename / merge / dismiss, error with retry.

**Phase 9, change the register bullet:** `nlp/register.py` first tries the
learned classifier from Phase 5b and uses the rule cues (kept in an editable
JSON file) as features and as the fallback.

### Notes for the team (not part of the owner's text)

- Phases 5, 5b and the register work in Phase 9 are not built yet. The
  current evaluation data (`fastapi_core/data/llm/`, `data/test/`) is LLM- or
  Claude-written and was never human-labeled for priority or register, so it
  does not meet the new Phase 5 rule ("labeled by humans independently of our
  rules"); the new dataset has to be built and labeled first.
- scikit-learn (1.9.1) is installed in the service's venv only as a
  dependency of sentence-transformers; Phase 5b should pin it in
  `fastapi_core/requirements.txt`. Its agglomerative clustering (and
  `sklearn.cluster.HDBSCAN`) cover category discovery without a new package.
