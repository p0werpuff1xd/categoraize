# CategorAIze hand-labeled test set
#
# Write about 100 short emails yourself (roughly a third each English,
# Filipino and Taglish), the way real school and work emails sound, and mark
# the spans. Do NOT copy from a real mailbox. Labeling rules: data/README.md.
#
# Format: one email per block, blocks separated by a line with only ---
# Start each block with "# lang: en", "# lang: tl" or "# lang: taglish".
# Lines starting with # are comments and are ignored.
#
# Check the file any time with:
#   python -m training.convert_markup data/test/hand_labeled.md
# Once this file has emails, training.retrain and training.evaluate use it
# instead of provisional_claude.md.
#
# Examples (commented out; delete the leading "# " to use the format):
#
# # lang: taglish
# Hi team, [TASK]paki-send ang final weekly report[/TASK] [DATE]bukas[/DATE]. Salamat!
# ---
# # lang: en
# Good morning. [TASK]Please review the attached budget[/TASK] before [DATE]Friday at 3 PM[/DATE].
# ---
# # lang: tl
# Class, [TASK]ipasa ninyo ang lab report[/TASK] [DATE]bukas ng umaga[/DATE].
#
# Write your emails below this line.
