# CategorAIze Bilingual Email Dataset v1.0

Fictional English, Taglish and Filipino emails with gold labels for: category (8), priority (1 to 5), sender-tone register, TASK/DATE spans (character offsets), resolved dates, and calendar-conflict flags. Built for the CategorAIze capstone (DLSU-D).

## Important: label provenance (read this first)

- **No real emails.** Every email is fictional (names, companies and amounts are invented). No Gmail or Outlook data was used, which keeps the dataset compatible with Google Limited Use rules.
- **Labels are AI-authored** (written by Claude) and `human_reviewed` is `false` on every record. They are a strong first draft, **not** human-verified ground truth.
- Before you claim "human-labeled" in the paper: have a second person label the blind test sheet, report Cohen's kappa (`scripts/kappa.py`), adjudicate, and have a native Filipino speaker review the Taglish/Filipino items (`review/`).
- Train is **template-synthetic** (24 category-language cells x 3 templates x 4 slot variants + 12 conflict cases). Priority and register are fixed per template by judgment, not computed from rules. Expect it to be easier and less diverse than real mail; the **test set is hand-written and is the number to report**.

## Files

| path | what |
|---|---|
| `data/train.jsonl` | 300, template-synthetic (100 en / 100 mixed / 100 tl) |
| `data/dev.jsonl` | 30, hand-written, for tuning thresholds/boosts (10 per language) |
| `data/test.jsonl` | 100, hand-written (34 en / 33 mixed / 33 tl), report results only here |
| `data/categories.json` | slugs, names and descriptions (use as zero-shot category descriptions) |
| `LABELING_GUIDELINE.md` | label rules |
| `review/second_labeler_test_BLIND.csv` | blank sheet for the independent labeler |
| `review/native_speaker_review.csv` | naturalness/label review for Taglish and Filipino items |
| `reports/` | balance and near-duplicate reports |
| `scripts/` | `validate.py`, `kappa.py`, `build.py` and the authoring sources |

## Record schema

`id, split, source, human_reviewed, language (en|mixed|tl), subject, body, sender_role, is_vip, received_at (ISO, Asia/Manila), gold_category, gold_spans [{label TASK|DATE, text, start, end, resolved?, ambiguous?}], gold_priority 1-5, gold_register, calendar_busy [{start,end}], gold_calendar_conflict`

Span offsets index into `body`. Dates are resolved against `received_at`.

## Numbers

Test: 100 emails, 61 TASK and 69 DATE spans (3 ambiguous dates), 7 emails with calendar data (4 conflicts), 6 VIP senders. Priority: P1 11, P2 24, P3 28, P4 29, P5 8. See `reports/balance_report.md`.

Test scenarios are intentionally **parallel across the three languages** (same situation written in each) so per-language scores are comparable. Train never shares a template phrasing with dev/test (max 3-gram Jaccard vs dev/test is 0.27; validator checks exact overlap = 0).

## Use

```
python scripts/validate.py .                      # schema, offset, leakage, conflict checks
python scripts/kappa.py . filled_second_labeler.csv
python scripts/build.py ./rebuilt                 # regenerate from authoring sources
```

Suggested protocol: tune on dev, freeze, report test overall and per language with bootstrap CIs, against baselines (B1 keyword rules, B2 zero-shot SBERT, B3 SBERT + tuned boosts, B4 full system).

## Limits

Small test set (wide confidence intervals); fictional register and topics skew to office/school email; Taglish code-switching patterns are limited to what the author wrote; "po/opo" and regional variants are lightly covered. Do not train a shared production model on this set and then describe it as real-user data.
