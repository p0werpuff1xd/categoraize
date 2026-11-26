# CategorAIze Usability Test Plan

**Version:** 1.1 (draft)
**Product under test:** CategorAIze web app (`apps/web`), local demo build
**Test type:** Moderated, task-based usability test with think-aloud protocol
**Owners:** Lauren Jade P. Quidit (facilitator, analysis), team members (note-taking)

> **Changes from 1.0:** Routes and control names now match the app (Priority Inbox, Label Studio, Rules → Settings). Task 4 starts from the reading pane, not the badge. Task 5 tests confirming or rejecting a deadline, because a deadline cannot be edited. Task 7 tests the existing auto-draft feature, because there is no on-demand draft button or tone chips. Task 9 uses the `Create "<name>"` suggestion. The checklist task numbers and the counterbalanced orders are corrected.

---

## 1. Purpose and Objectives

CategorAIze turns a Gmail inbox into a triage workspace: messages are sorted into labels, tagged with P1–P5 priority, scanned for deadlines and action items, and can get an automatic draft reply. This test checks whether a first-time user can understand and use that workspace without help.

Objectives:

1. **Discoverability:** Can users find the Priority Inbox (`/categoraize/triage`) and understand its badges and sort order without instruction?
2. **Comprehension of priority:** Do users understand the "Why this priority" panel (FR-5.5) and can they tell computed priority from a manual override (FR-5.6)?
3. **Correction flows:** Can users correct a wrong label and confirm or reject an extracted deadline, and do they understand that this improves future suggestions?
4. **Label setup:** Can users create a label and set its base priority in Label Studio (`/categoraize/rules`) (FR-3.4, FR-5.7)?
5. **Trust and control:** Do users understand that drafts are never sent automatically (FR-6.3) and that external AI processing can be turned off?
6. **Overall usability:** Measured with task success, time on task, error counts, SEQ, and SUS.

Out of scope: performance under load, Gmail OAuth security review, the accuracy of the NLP models (measured separately in the NLP evaluation), and the Bi-LSTM-CRF tagger's F1 scores.

### 1.1 Where things are in the app

The facilitator uses this map to score tasks. Participants never see it. All paths are under `/<emailAccountId>`.

| Plan term | Sidebar name | Path | What the participant uses |
|---|---|---|---|
| Triage view | Priority Inbox | `/categoraize/triage` | P1–P5 badges, sort order, filter chips, reading pane |
| Priority reasoning | (reading pane) | `/categoraize/triage` | "Why this priority" section; "Override priority"; "Reset to computed P#" |
| Label correction | (reading pane) | `/categoraize/triage` | "Label" section: "Accept label", "Move to label…", "Correct label" |
| Deadlines | (reading pane) | `/categoraize/triage` | "Dates" section: "Confirm deadline", "Not a deadline", add to calendar |
| Tasks | Priority Inbox | `/categoraize/triage` | Task Sheet (mark done) |
| Labels and base priority | Label Studio | `/categoraize/rules` | Create label, description, "Base priority"; suggested labels |
| Auto drafts | Rules → Settings tab | `/automation` (Settings tab) | "Auto draft replies" toggle |
| External AI switch | Rules → Settings tab | `/automation` (Settings tab) | "External AI processing" toggle |
| Drafts | Mail → Drafts | `/mail` | Draft created by auto-draft |

The sidebar item named **Rules** opens `/automation`, not Label Studio. This matters for Task 6 (see Section 11).

---

## 2. Research Questions

| # | Question | Linked objective |
|---|---|---|
| RQ1 | Can a new user find and read the P1–P5 priority of a message without guidance? | 1 |
| RQ2 | Does the "Why this priority" panel make the priority reasoning clear? | 2 |
| RQ3 | Do users know how to correct a label or a deadline, and do they expect the correction to be remembered? | 3 |
| RQ4 | Can users set up a label and its base priority in Label Studio without help? | 4 |
| RQ5 | Do users trust the auto-draft feature enough to use it, and do they understand nothing is sent automatically? | 5 |

---

## 3. Method

- **Format:** Remote or in person, 45–60 minutes per session. One facilitator, one note-taker.
- **Setting:** Participant uses a laptop or desktop with the demo build running locally (or on a staging URL agreed in advance). Screen and voice recorded only with written consent.
- **Protocol:** Think-aloud. The facilitator reads each task once, does not explain interface elements, and only intervenes if the participant is stuck for more than 3 minutes or asks for help. Intervention is logged as a failure.
- **Order:** Two orders, assigned alternately (P1 = A, P2 = B, …) to reduce order effects. The two swapped blocks do not depend on each other.
  - **Order A:** 1, 2, 3, 4, 5, 6, 7, 8, 9
  - **Order B:** 1, 2, 5, 6, 3, 4, 7, 8, 9
  - Tasks 1–2 stay first (orientation). Tasks 7–8 stay last and in that order, because Task 7 needs external AI on and Task 8 turns it off.
- **Data used:** A **demo mailbox** prepared by the team with synthetic messages covering all eight labels, English, Taglish, and Filipino text, and a range of deadlines and priorities. Participants must **not** connect their own Gmail accounts during the session. If a participant wants to try their own account afterward, that is a separate consent step, and the test data stays out of the study.

### 3.1 Participants

| Attribute | Target |
|---|---|
| Number | 6–8 (Nielsen's guideline: 5 participants find about 85% of usability problems in one iteration) |
| Profile | Working professionals or students who receive email daily and read Taglish or Filipino correspondence |
| Excluded | Team members who built the feature; anyone who has used CategorAIze before |
| Mix | At least 2 participants who are primarily Filipino-language readers, at least 2 who work in English-heavy environments |
| Compensation | Per local practice (e.g., a small gift card or meal), agreed in advance |

Recruitment screener (yes/no): (1) Do you receive more than 20 work or school emails per day? (2) Do you use Gmail? (3) Have you ever used an email app with automatic labels or priority tags? (4) Do you sometimes write or read emails in Filipino or Taglish?

### 3.2 Environment and Materials

- Demo build with the demo mailbox loaded and reset before each session
- Task cards (Section 6), one per task, printed or shown on a second screen
- Consent form and privacy notice (Section 9)
- Observation sheet (Section 7.2)
- Post-test questionnaire: SEQ after each task, SUS and open questions at the end

---

## 4. Test Environment Setup Checklist

- [ ] Demo build deployed or running locally; Priority Inbox (`/categoraize/triage`), Label Studio (`/categoraize/rules`), Contacts (`/categoraize/contacts`), and Rules → Settings (`/automation`) load without errors
- [ ] NLP service running and reachable (`/healthz` returns OK)
- [ ] Demo mailbox seeded with the test set in Section 5.1
- [ ] Each message's expected label, priority, and deadline recorded in the facilitator's key
- [ ] "External AI processing" and "Auto draft replies" are **on** at session start, and the auto-draft for the Task 7 message already exists in Mail → Drafts
- [ ] "External AI processing" is still **on** when Task 8 starts (the participant turns it off)
- [ ] No "Side Project" label exists (Task 6)
- [ ] Screen recording and consent form ready
- [ ] Session reset script run between participants so no changes carry over (labels, overrides, confirmed or rejected deadlines, settings)

---

## 5. Test Data

### 5.1 Demo mailbox (synthetic)

The team writes all messages. No real correspondence is used. `apps/web/scripts/categoraize-seed-data.ts` covers the baseline set; add the task-specific messages below to it.

| Type | Count | Purpose |
|---|---|---|
| One clear example per label (8 total) | 8 | Baseline recognition |
| Deadline in English ("due Friday, Nov 28") | 2 | Deadline display (FR-4.5) |
| Deadline in Taglish ("pa-submit bukas") | 2 | Taglish deadline handling |
| Email the classifier is likely to get wrong (e.g., a school alert phrased like a promotion) | 3 | Label correction (Task 5) |
| Email with no validated deadline | 2 | "No deadline" messaging (FR-5.5) |
| Email from a VIP sender | 1 | VIP as a priority factor (FR-5.5) |
| Email that fits no label (Uncategorized), with a suggested new label | 2 | Label suggestion flow (FR-3.6, Task 9) |

**Task-specific messages (must exist, with these subjects):**

| Task | Subject | Required state |
|---|---|---|
| 3 | "Thesis revision due Monday" | P1 or P2; the "Why this priority" panel lists at least two factors (e.g., label and deadline) |
| 4 | A newsletter (e.g., "This week in tech") | Labelled as a promotion or newsletter, low computed priority |
| 5 | A school email phrased like a promo | Wrongly labelled as promotions; its Dates section shows **one wrong date** (e.g., an event date read as a deadline) and **one correct deadline** |
| 7 | "Availability on Thursday?" | Needs a reply; auto-draft already generated (it should accept, so the participant has to change it) |
| 9 | An Uncategorized email | Shows a `Create "<name>"` suggestion in the Label section |

### 5.2 Facilitator key

For each message, record the expected label, expected priority, the factors shown in "Why this priority", and each extracted date with whether it is a real deadline. Use this key to score Tasks 2–5 and 9.

Before the pilot, check whether the "Why this priority" panel names VIP for the VIP sender's message. If it does not, VIP only affects the score and is not visible, so do not count "VIP" as a factor a participant can name in Task 3.

---

## 6. Task Scenarios

Read each task aloud and show the card. Do not name UI elements. Time each task from "start" to the participant saying they are done (or giving up).

**Task 1: Orientation (first look, 2 min)**
> "This is your inbox. Tell me what you see and what you think this app is for."

- *Start screen:* Priority Inbox.
- *Measures:* RQ1. Whether the user identifies priority and labels as the main idea.
- *Probe:* "What do the colored or lettered tags mean to you?"

**Task 2: Find the most urgent message (RQ1)**
> "Find the email that you think needs your attention first today. Tell me why you chose it."

- *Success:* Participant selects a P1 or P2 message, or the message with the nearest validated deadline, using the sort order or a priority filter.
- *Measures:* time to find, whether the user uses the filter chips or the sort toggle, whether they explain the sort order correctly.

**Task 3: Understand a priority (RQ2)**
> "Open the 'Thesis revision due Monday' email. Explain why it has this priority."

- *Success:* Participant opens the reading pane, reads the "Why this priority" section, and states at least one listed factor (label, deadline, sender role, or VIP if visible) in their own words.
- *Measures:* whether the participant finds the section without help; whether their explanation matches the factors in the facilitator key.

**Task 4: Change a priority manually (RQ2)**
> "You think this newsletter is actually important to you. Change its priority so it is not treated as a promotion. Then undo the change."

- *Success:* Participant opens the email, sets a higher priority with the priority override in the "Why this priority" section, notices the email is now marked as manual, and returns it with "Reset to computed P#".
- *Measures:* whether the participant first tries the badge in the list (log as an error, and note it as a discoverability finding); whether the manual marker is noticed; whether the reset is found.

**Task 5: Correct a label and check its dates (RQ3)**
> "This email was put in 'promotions', but it is from your school. Fix that. Then look at the dates the app found in it. Keep the ones that are real deadlines and remove the ones that aren't."

- *Success:* Participant chooses the right label in "Move to label…" and presses "Correct label". In the Dates section, they press "Confirm deadline" on the real deadline and "Not a deadline" on the wrong one.
- *Measures:* success, time, number of wrong attempts, whether the participant tries to edit a date directly (log it; the app cannot do this), and whether the participant says anything about what happens after a correction.
- *Probe after task:* "What do you think happens to the app after you change this?" (Expected understanding: it learns from corrections and is more accurate later.) If they tried to edit a date: "What would you expect to be able to do with a wrong date?"

**Task 6: Create a new label (RQ4)**
> "You want a category for emails about your side project. Create one called 'Side Project' with a short description, and set its base priority to P3."

- *Success:* Participant creates the label in Label Studio, fills the description, and sets base priority to P3.
- *Measures:* success, time, whether the participant goes to the **Rules** sidebar item first (log as an error), and whether they understand what the description is for.
- *Probe:* "What would you write in the description, and what do you think it does?"

**Task 7: Review an automatic draft (RQ5)**
> "Someone emailed asking if you are free on Thursday. The app may have already prepared a reply for you. Find it, check it, and make it say, politely, that you can't make it."

- *Success:* Participant finds the draft (Mail → Drafts, or from the email's thread), reads it, and changes it to decline, or states clearly that they would change it before sending. They do not send it without reviewing.
- *Measures:* whether the participant knows the app drafted the reply on its own; where they look first; any attempt to send without reviewing (Critical, see Section 8); how they describe where the draft is.
- *Probe:* "Who wrote this draft, and when? Would anything be sent if you didn't touch it?"

**Task 8: Turn off external AI (RQ5)**
> "You are worried about sending your email to outside AI services. Find out whether you can turn that off, and turn it off."

- *Success:* Participant finds "External AI processing" on the Settings tab of Rules (`/automation`) and turns it off.
- *Measures:* time to find, where they look first (e.g., the account `/settings` page), whether the setting label is understood, and whether they notice that "Auto draft replies" becomes unavailable.
- *Probe:* "What do you think stops working now?"

**Task 9: Decide on an unrecognized email (RQ3, optional if time permits)**
> "This email doesn't seem to belong to any of your categories. Decide what you would do with it."

- *Success:* Participant sees the "Suggested new label" line and either presses `Create "<name>"`, chooses an existing label with "Move to label…", or decides to create a label in Label Studio. They should not expect a label to be created without pressing a button.
- *Measures:* whether the participant notices the suggestion and understands that nothing happens until they confirm.

---

## 7. Metrics and Data Collection

### 7.1 Quantitative

| Metric | Definition | Target (initial, to be revised after pilot) |
|---|---|---|
| Task success rate | Completed without facilitator help, to the success criteria | ≥ 80% for Tasks 2, 3, 5, 8; ≥ 70% for Tasks 4, 6, 7, 9 |
| Time on task | Seconds from task start to completion or give-up | Reported as median per task; flag any task above 2× its median |
| Error count | Wrong clicks or wrong screens, counted per task | Report per task; no fixed target |
| Assists | Facilitator interventions | 0 preferred; each one counted as a failure |
| SEQ (Single Ease Question, 1–7) | Asked after each task | ≥ 5.5 mean |
| SUS (System Usability Scale) | 10-item questionnaire after all tasks | ≥ 68 (average), ≥ 80 (good) |

### 7.2 Qualitative

- **Think-aloud notes:** verbatim quotes, grouped by task
- **Misconception log:** anything the participant believes that is wrong (e.g., "I think the AI sends the email for me")
- **Trust statements:** what the participant says about accuracy, privacy, or control
- **Facilitator observation sheet:** where the participant hesitated, looked at the wrong element, or re-read text
- **Missing-feature log:** things participants try that the app cannot do (e.g., editing a date, changing priority from the badge, choosing a tone). These feed the backlog, not the task score.

### 7.3 Post-test questionnaire

1. Which feature was the most useful? Why?
2. Which feature confused you most? What did you expect it to do?
3. If you could change one thing, what would it be?
4. Would you trust this app to sort your important email? What would make you trust it more or less?
5. Anything you expected to find that was not there?

---

## 8. Analysis Plan

1. **Score each session** against the facilitator key (Section 5.2). Record success, time, errors, assists.
2. **Aggregate** success rates, median times, and SEQ scores per task. Compute SUS using the standard scoring method. Compare Order A and Order B for Tasks 3–6 to check for order effects.
3. **Code qualitative notes** into themes using affinity mapping: group each observation under a theme (e.g., *priority meaning*, *correction trust*, *draft safety*, *navigation naming*). Count how many participants hit each theme.
4. **Prioritize findings** using an impact/effort matrix. Impact = how many participants were affected and whether the task failed. Effort = estimated change size.
5. **Severity scale:**
   - *Critical:* Task cannot be completed, or the user takes an unintended action (e.g., sends a draft by accident)
   - *Major:* Task completed only with significant difficulty or a wrong understanding
   - *Minor:* Friction or confusion that did not block completion
   - *Cosmetic:* Wording, layout, or visual issues
6. **Report** each finding as: observation, evidence (quotes and counts), severity, recommendation, and the task or research question it answers.

---

## 9. Ethics, Consent, and Privacy

- Participants receive a plain-language consent form before the session. They may stop at any time, skip any task, and withdraw their data within 7 days.
- Recording is optional and requires separate written consent.
- Participants are identified by code (P1, P2, …). Names and contact details are stored separately from session notes and deleted after the study ends.
- No real email content is shown to participants. The demo mailbox is synthetic.
- No participant's Gmail account is connected during the study. Any real account use is a separate, opt-in activity.
- The facilitator does not collect or record the participant's personal data beyond the screener answers and the questionnaire.
- Data is stored on the team's own encrypted storage and is used only for this study and the thesis report.

---

## 10. Schedule

| Phase | Duration | Activities |
|---|---|---|
| Preparation | 1 week | Finalize tasks, add task-specific messages to the demo mailbox, fill in the facilitator key |
| Pilot | 2 days | Run one pilot session with a team member; check Task 5 and 7 data, the VIP check in Section 5.2, and timing |
| Sessions | 1–2 weeks | 6–8 participant sessions, 45–60 min each |
| Analysis | 1 week | Scoring, affinity mapping, severity rating |
| Report | 3 days | Findings, recommendations, thesis section |

---

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Participants find the demo mailbox artificial and behave differently | Use realistic synthetic messages; mention that the data is demo data only |
| Classifier errors in the demo set confuse the test rather than the UI | Pre-check every demo message's output before sessions; remove or fix messages that behave unexpectedly. Task 5 depends on an intended misclassification and a wrong date, so confirm both after each reset |
| The sidebar has both "Rules" (`/automation`) and "Label Studio" (`/categoraize/rules`); a task that says "category" may send people to the wrong one | Do not name either in the task wording. Log wrong-screen visits as errors and report them as a navigation-naming finding |
| The auto-draft for Task 7 is missing or different between sessions | Generate it before each session and check its text; keep a backup copy to restore it |
| Local demo build or NLP service fails mid-session | Run the setup checklist before each session; have a backup build ready; reschedule rather than continue with broken data |
| Facilitator bias (helping too often) | Use the fixed intervention rule (3 minutes or explicit request); a second observer logs assists |
| Small sample | Treat results as formative. Report findings as patterns, not statistics |
| Participants unfamiliar with Taglish or Filipino data | Recruit at least two participants who read Filipino or Taglish, as stated in Section 3.1 |

---

## 12. Reporting and Deliverables

- Usability test report: method, participants (anonymized), task results, SUS, findings with severity, recommendations
- Highlight reel: 3–5 short clips or quotes showing the most important problems
- Updated task list and backlog for the next design iteration, including the missing-feature log (Section 7.2)
- A thesis section (Chapter 4 or 5, Evaluation) summarizing the results, linked to Research Questions RQ1–RQ5

---

## Appendix A: Consent Statement (short form)

> "You are invited to take part in a usability test of CategorAIze, an email organizing app being studied as part of a university project. You will complete about nine short tasks using demo email data, not your own inbox. You can stop at any time. We will take notes and, if you agree, record the screen and your voice. Your name will not appear in any report. Your data will be deleted within 7 days if you ask us to withdraw it."

Participant signature / date: ____________________   Facilitator: ____________________

## Appendix B: Facilitator Script (opening)

> "Thank you for coming. We are testing an email app, not you, so there are no wrong answers and you can't do anything wrong. Please think aloud as you work, like telling me what you're looking at and what you expect to happen. I won't be able to answer questions while you're working on a task, but I'll read each task to you once. If you get stuck, tell me, and we'll move on. Do you have any questions before we start?"

## Appendix C: Session Record Template

| Field | Value |
|---|---|
| Participant code | |
| Date / time | |
| Screener result | |
| Consent signed | Y / N |
| Recording consent | Y / N |
| Build version | |
| Order (A: 1–9 in sequence; B: 1, 2, 5, 6, 3, 4, 7, 8, 9) | |

| Task | Success (Y / Partial / N) | Time (s) | Errors | Assists | SEQ (1–7) | Notes / quotes |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |

SUS score: ______
