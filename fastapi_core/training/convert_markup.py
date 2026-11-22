"""Check a hand-labeled markup file and show its BIO tags.

    python -m training.convert_markup data/test/hand_labeled.md
    python -m training.convert_markup data/test/hand_labeled.md --out data/test/hand_labeled.conll

Prints how many emails, TASK and DATE spans were found per language, and
fails with the block number if a tag is unbalanced. With --out it also writes
CoNLL-style "token<TAB>tag" lines, one blank line between sentences.
"""

import argparse
from collections import Counter
from pathlib import Path

from .data import load_markup_file, to_sentences


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("path", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    examples = load_markup_file(args.path.resolve())
    spans = Counter((example.lang, span.label) for example in examples for span in example.spans)
    emails = Counter(example.lang for example in examples)
    print(f"{len(examples)} emails in {args.path}")
    for lang, count in sorted(emails.items()):
        print(f"  {lang:<8} {count:>3} emails, {spans[(lang, 'TASK')]:>3} TASK, {spans[(lang, 'DATE')]:>3} DATE")

    if args.out:
        lines = []
        for sentence in to_sentences(examples):
            lines.extend(f"{token.text}\t{tag}" for token, tag in zip(sentence.tokens, sentence.tags, strict=True))
            lines.append("")
        args.out.write_text("\n".join(lines), encoding="utf-8")
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
