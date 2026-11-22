# CategorAIze labeling guideline (v1.0)

Use this when reviewing the dataset or acting as the second labeler. Label what a busy Filipino professional/student would need from the email, using only the email text, sender role, VIP flag and received time.

## 1. Category (exactly one)

| slug | Use when the email is mainly about |
|---|---|
| work_tasks | Work requests, deliverables, reviews, builds, status. |
| meetings | Scheduling, rescheduling, invitations, calls, social meet-ups proposed as a time slot. |
| school | Classes, deadlines, enrollment, lecture notes, group work. |
| job_search | Applications, interviews, assessments, job alerts, offers. |
| finance_billing | Invoices, bills, receipts, refunds, expense reports. |
| promotions | Sales, newsletters, marketing, webinars, referral offers. |
| alerts | Automated system/security/delivery/storage notices. |
| personal | Family, friends, social plans, chit-chat. |

Tie-breakers: pick the category of the **main action or purpose**. An overdue invoice from a vendor is finance_billing (not work_tasks). A lunch invitation is meetings; a family birthday dinner is personal. A webinar invitation from a company is promotions. An automated job-board digest is job_search with priority 1.

## 2. Priority (1 to 5, from the recipient's point of view)

- **5**: action needed within about 24 hours, or critical/outage, or a senior sender with a hard deadline.
- **4**: action needed within about 3 days, or important (interviews, overdue bills, security notices, exams).
- **3**: action within about a week, or useful to know with a soft deadline.
- **2**: FYI, no action, or casual.
- **1**: promotion or ignorable automated content.

Sender role and VIP flag push priority **up** when a request exists; they never make a promotion above 2. Missing calendar data never lowers priority. A calendar conflict does **not** change the human priority label (it is a separate computed flag).

## 3. Register (the sender's tone)

- **formal**: polite honorifics, "po", "Dear", "Kindly", full sentences.
- **neutral**: plain professional or everyday tone.
- **casual**: slang, emoji, lowercase, banter.

## 4. Spans (for the tagger)

- **TASK**: the shortest phrase that says what the recipient must do (verb + object). Exclude the deadline and politeness words ("please", "paki-", "po") when they sit outside the core action. Do not tag FYI statements or things the sender will do.
- **DATE**: the phrase that gives a date/time in the email, as written ("tomorrow 10 AM", "Biyernes", "sometime next week"). Each DATE has a resolved ISO value computed relative to `received_at` (Asia/Manila), or `ambiguous: true` with no value when the phrase is vague ("next week", "soon"). Ambiguous dates never count toward conflicts.
- Spans must not overlap. Offsets are computed programmatically from the markup `[[T|text|]]` / `[[D|text|code]]`.

## 5. Calendar conflict (computed, not labeled)

`gold_calendar_conflict` is true if a resolved DATE time falls inside any interval in `calendar_busy`. Do not label it by hand.

## 6. Language tags

en = English; mixed = Taglish (Tagalog and English in the same email); tl = Filipino/Tagalog with at most proper nouns or tech terms in English.

## 7. Review workflow

1. Second labeler fills `review/second_labeler_test_BLIND.csv` **without looking at the gold labels**.
2. Run `python scripts/kappa.py . filled.csv`. Target: category kappa at least 0.70, priority weighted kappa at least 0.60.
3. Adjudicate disagreements together, fix the gold file, set `human_reviewed` to true for items a human confirmed.
4. A native Filipino speaker fills `review/native_speaker_review.csv` for naturalness and label fixes.
