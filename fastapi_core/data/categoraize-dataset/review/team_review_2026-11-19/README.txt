Team review of the test labels, 2026-11-19

Files: <INITIALS>_1_blind.csv (second labeler, 100 test emails split across
KIM, AD and LJ) and <INITIALS>_2_native.csv (native-speaker naturalness and
label check of 111 Taglish/Filipino items).

Provenance, as stated by the project owner: each reviewer labeled their own
packet from a blank sheet without seeing the AI-drafted labels. Earlier
AI-drafted versions of these sheets were not used. Files were converted to
UTF-8; 7 curly-quote characters in free-text fixes were already unreadable in
the submitted copies (labels unaffected).

Results: python -m eval.human_review (eval/results/human_review.json, shown in
eval/RESULTS.md). The gold labels were not adjudicated or changed.
