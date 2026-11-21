# Adjudication log: second labeler vs gold (test split, n = 100)

Source sheet: `review/second_labeler_test_FILLED.csv` (copied from `D:\downlows\categoraize_test_emails_filled.csv`).
Rule: `LABELING_GUIDELINE.md` (v1.0).

| id | field | gold | second labeler | decision | reason |
|---|---|---|---|---|---|
| test-en-009 | category | meetings | personal | gold | Lunch invitation is meetings (guideline section 1). |
| test-mixed-009 | category | meetings | personal | gold | Same as above. |
| test-tl-008 | category | meetings | personal | gold | Same as above. |
| test-mixed-025 | priority | 4 | 1 | gold | Security notice is priority 4 (guideline section 2). |
| test-mixed-026 | priority | 3 | 5 | lowered to 2 (team decision) | No action required; parallels test-en-028 and test-tl-026 also set to 2. |
| test-mixed-027 | priority | 5 | 2 | gold | Production CPU alert calls for investigation: critical/outage (5). |
| test-mixed-028 | priority | 3 | 5 | gold | Storage warning needs action within about a week (3). |
| test-mixed-032 | priority | 3 | 1 | gold | RSVP request with a soft deadline (3); not an ignorable notice. |

**Applied change.** `test-en-028`, `test-mixed-026`, `test-tl-026`: gold priority 3 to 2. Made in the worktree `E:\categoraize\wt-dataset-fix` on `feat/dataset-eval-learned-models`, uncommitted. Pre-change file: `review/test_before_priority_fix.jsonl`.

**Effect on priority exact agreement (saved results, no models re-run).** B1 0.330 to 0.360; B2 0.310 to 0.340; B3 0.360 to 0.370; B4 0.450 to 0.420.
