# Matching evaluation sets

Invented emails and threads (written by Claude for tuning; not from any
mailbox) used by `python -m training.eval_matching`:

- `rules.jsonl`: one email per line with the default Inbox Zero rule it
  should match (`To Reply`, `Newsletter`, `Marketing`, `Calendar`, `Receipt`,
  `Notification`, `OTP`) or `NONE`.
- `threads.jsonl`: short threads (`from_user` per message) with the expected
  Reply Zero status (`TO_REPLY`, `AWAITING_REPLY`, `FYI`, `ACTIONED`).

Within each label, examples alternate dev, test, dev, test... by file order.
Settings are tuned on dev only; test is scored once afterwards. The same
author wrote these and the descriptions being matched, so even test scores
are optimistic. Add the team's own examples here to make them more honest.
