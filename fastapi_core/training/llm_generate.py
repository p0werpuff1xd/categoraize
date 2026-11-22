"""Generate varied synthetic training/evaluation emails with an LLM (OpenRouter).

    python -m training.llm_generate tagger  --model google/gemma-4-31b-it:free --requests 10
    python -m training.llm_generate rules   --model ... --requests 4
    python -m training.llm_generate threads --model ... --requests 4

Everything generated is invented: the prompts contain only these instructions,
never user or mailbox data, so the output is synthetic data under the plan's
rules. Each email is validated (markup parses, labels are known, no
duplicates) before it is appended to data/llm/<task>.jsonl. About 10% of the
tagger emails are written to data/llm/tagger_holdout.jsonl and never trained on.

Needs OPENROUTER_API_KEY in the environment. On the free tier OpenRouter
allows about 50 requests a day, so each request asks for many emails.
"""

import argparse
import hashlib
import json
import os
import random
import re
import time
import urllib.error
import urllib.request

from app.nlp.tokens import MarkupError, parse_markup

from .data import DATA_DIR

OUT_DIR = DATA_DIR / "llm"
API_URL = "https://openrouter.ai/api/v1/chat/completions"
LANG_WEIGHTS = {"taglish": 0.4, "tl": 0.3, "en": 0.3}
DOMAINS = [
    "university classes and thesis", "high school class announcements", "office work and reports",
    "family group and relatives", "friends and barkada plans", "online shopping and deliveries",
    "bank, e-wallet and bills", "government offices and requirements", "church and parish activities",
    "barangay and community", "freelancing and clients", "small business and suppliers",
    "student organization", "hospital and clinic appointments", "landlord and boarding house",
    "sports team and gym", "job applications and HR", "school canteen and events",
]
RULE_LABELS = ["To Reply", "Newsletter", "Marketing", "Calendar", "Receipt", "Notification", "OTP", "NONE"]
THREAD_LABELS = ["TO_REPLY", "AWAITING_REPLY", "FYI", "ACTIONED"]

LABELING_RULES = """Labeling rules (follow exactly):
TASK = the requested action, from the request word (please, kindly, can you, could you, pls, paki-/paki,
pakisuyong, pa-, kailangan mong/ninyong, pwede bang) or the verb of a direct order, to the end of the request
clause: keep the object, its details, where it goes, and "whether" clauses. Stop before a date, a deadline
word (by, before, until, on, no later than, bago, hanggang), a reason or purpose (kasi, dahil, para, so we
can, to avoid), a condition (if you have time, kung may oras ka) or punctuation. Leave out particles at the
very end (po, naman, na, ha). NOT a task: "please find attached", "please note", "kindly be advised",
"please welcome X", thanks, news, things already done ("na-submit ko na").
DATE = any date or time expression, future or past, with modifiers and times ("next Monday", "tomorrow at
3pm", "bukas ng umaga", "sa Biyernes", "mamayang gabi", "Nov 20", "kahapon"). Include "sa" when it belongs to
the date. Leave out deadline words (by, before, on, until, bago, hanggang).
Mark spans inline with [TASK]...[/TASK] and [DATE]...[/DATE]. Never nest tags."""


def call_model(model: str, prompt: str, key: str) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 1.0,
        "max_tokens": 12000,
    }).encode()
    request = urllib.request.Request(
        API_URL, data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.load(response)
    return payload["choices"][0]["message"]["content"] or ""


LANG_NAMES = {
    "taglish": "Taglish (natural English-Filipino code-switching)",
    "tl": "Filipino/Tagalog (little or no English)",
    "en": "English (Philippine context)",
}


DEFAULT_CYCLE = ["taglish", "tl", "en", "taglish", "tl", "en", "taglish", "tl", "en", "taglish"]


def batch_language(number: int, cycle: list[str] | None = None) -> str:
    """Rotate one language per request (default: the 40/30/30 mix)."""
    cycle = cycle or DEFAULT_CYCLE
    return cycle[(number - 1) % len(cycle)]


def tagger_prompt(rng: random.Random, count: int, lang: str, request_share: float = 0.5) -> tuple[str, list[str]]:
    domains = rng.sample(DOMAINS, 6)
    requests = round(request_share * 100)
    return f"""Write {count} different short emails (1 to 5 sentences each) that people in the Philippines might send.
Write ALL of them in {LANG_NAMES[lang]}; set "lang" to "{lang}".
Topics: mostly {', '.join(domains)}; vary senders, tone (formal, casual, texting style, lowercase), length and wording.
Kinds, mixed: about {requests}% contain a request (some with a deadline, some without; vary how the request is
phrased: questions, polite requests, direct orders, indirect asks like "it would help if you could..."), the rest
contain only dates or news with no request, "fake requests" (please find attached, please note, please welcome),
or subject-line-like fragments. Use many different verbs, date expressions and sentence shapes.
Invent all names; no real people or companies' private data.

{LABELING_RULES}

Output ONLY one JSON object per line, no other text:
{{"lang": "{lang}", "markup": "the email text with inline tags"}}""", [lang] * count


# Cleanup for the most common labeling slips by the generating model.
_DATE_WORD = re.compile(
    r"\d|\b(?:today|tonight|tomorrow|yesterday|now|noon|midnight|morning|afternoon|evening|night|week|weekend|month|"
    r"year|eod|eow|cob|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|"
    r"thurs|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|"
    r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|bukas|mamaya|mamayang|kahapon|ngayon|ngayong|kanina|"
    r"makalawa|kinabukasan|lunes|martes|miyerkules|huwebes|biyernes|sabado|linggo|buwan|umaga|tanghali|hapon|"
    r"gabi|alas|enero|pebrero|marso|abril|mayo|hunyo|hulyo|agosto|setyembre|oktubre|nobyembre|disyembre)\b",
    re.IGNORECASE,
)
_DATE_LEAD = re.compile(
    r"^(?:(?:by|before|until|till|on|no\s+later\s+than|on\s+or\s+before|bago|hanggang|for|due|deadline)\b[\s:,]*)+",
    re.IGNORECASE,
)
_DATE_TRAIL = re.compile(r"(?:[\s,]+(?:na|pa|po|deadline|na\s+deadline|lang))+$", re.IGNORECASE)
_TASK_TRAIL = re.compile(r"(?:[\s,]+(?:po|naman|na|ha|please|pls))+$", re.IGNORECASE)


def clean_markup(markup: str) -> str:
    def fix_date(match: re.Match) -> str:
        inner = match.group(1)
        lead = _DATE_LEAD.match(inner)
        prefix = inner[: lead.end()] if lead else ""
        core = inner[len(prefix):]
        trail = _DATE_TRAIL.search(core)
        suffix = core[trail.start():] if trail else ""
        core = core[: len(core) - len(suffix)]
        words = core.split()
        # Drop non-date words at the start ("Submitted today" -> "today").
        while words and not _DATE_WORD.search(words[0]) and words[0].casefold() not in {
            "next", "this", "coming", "last", "sa", "noong", "end", "the", "every", "ngayong", "susunod", "katapusan"
        }:
            prefix += words.pop(0) + " "
        core = " ".join(words)
        if not core or not _DATE_WORD.search(core):
            return inner  # not a date at all: drop the tag, keep the text
        return f"{prefix}[DATE]{core}[/DATE]{suffix}"

    def fix_task(match: re.Match) -> str:
        inner = match.group(1)
        trail = _TASK_TRAIL.search(inner)
        if not trail or trail.start() == 0:
            return match.group(0)
        return f"[TASK]{inner[: trail.start()]}[/TASK]{inner[trail.start():]}"

    markup = re.sub(r"\[DATE\](.*?)\[/DATE\]", fix_date, markup, flags=re.DOTALL)
    return re.sub(r"\[TASK\](.*?)\[/TASK\]", fix_task, markup, flags=re.DOTALL)


def rules_prompt(rng: random.Random, count: int) -> str:
    return f"""Write {count} different short emails (subject and 1 to 4 sentence body) received by someone in the Philippines.
Languages: about 40% Taglish, 30% Filipino/Tagalog, 30% English. Vary tone and wording a lot.
Each email belongs to exactly one label (spread evenly across labels):
- To Reply: someone asks the reader a question or requests something from them
- Newsletter: regular content from publications, blogs or subscribed services
- Marketing: promotions, sales, offers, vouchers
- Calendar: meeting invites, schedule changes, appointment reminders, event RSVPs
- Receipt: purchase confirmations, payment receipts, invoices, transaction records
- Notification: alerts, account or security notices, system status, delivery updates
- OTP: one-time codes, verification codes, password reset or magic sign-in links
- NONE: personal chit-chat or greetings with no request (birthdays, congratulations, photos, kumustahan)
Invent all names and numbers.

Output ONLY one JSON object per line, no other text:
{{"label": "<one label above>", "lang": "taglish|tl|en", "subject": "...", "body": "..."}}"""


def threads_prompt(rng: random.Random, count: int) -> str:
    return f"""Write {count} different short email threads (1 to 3 messages each) between "me" and someone else, set in the Philippines.
Languages: about 40% Taglish, 30% Filipino/Tagalog, 30% English. Vary topics (school, work, family, shopping, government).
Label each thread with its status from MY point of view (spread evenly):
- TO_REPLY: the other person asked me something or requested something and I have not answered, or I promised to send something later and have not yet
- AWAITING_REPLY: I asked or requested something (or they promised to get back to me) and I am waiting
- FYI: the other person only informs me; nothing is asked of me (never use when I wrote the last message)
- ACTIONED: the exchange is done (thanks, confirmation, I sent what was asked, or I said I'll handle it)
Invent all names.

Output ONLY one JSON object per line, no other text:
{{"label": "<status>", "lang": "taglish|tl|en", "messages": [{{"from_user": true|false, "subject": "...", "body": "..."}}]}}"""


def parse_lines(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        line = line.strip().strip(",")
        if not line.startswith("{"):
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


def valid_tagger(row: dict) -> bool:
    markup = row.get("markup")
    if not isinstance(markup, str) or len(markup) < 10 or row.get("lang") not in LANG_WEIGHTS:
        return False
    try:
        text, spans = parse_markup(markup)
    except MarkupError:
        return False
    # Spans must sit on word boundaries; a tag cutting a word in half is a labeling error.
    return all(
        (span.start == 0 or not text[span.start - 1].isalnum()) and (span.end == len(text) or not text[span.end].isalnum())
        for span in spans
    )


def valid_rule(row: dict) -> bool:
    return row.get("label") in RULE_LABELS and row.get("lang") in LANG_WEIGHTS and bool(row.get("body"))


def valid_thread(row: dict) -> bool:
    messages = row.get("messages")
    if row.get("label") not in THREAD_LABELS or row.get("lang") not in LANG_WEIGHTS:
        return False
    if not isinstance(messages, list) or not 1 <= len(messages) <= 4:
        return False
    if not all(isinstance(m, dict) and isinstance(m.get("from_user"), bool) and m.get("body") for m in messages):
        return False
    return not (row["label"] == "FYI" and messages[-1]["from_user"])


def fingerprint(row: dict) -> str:
    text = row.get("markup") or json.dumps(row.get("messages") or [row.get("subject"), row.get("body")])
    return hashlib.sha1(re.sub(r"\W+", "", text.casefold()).encode()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("task", choices=["tagger", "rules", "threads"])
    parser.add_argument("--model", required=True)
    parser.add_argument("--requests", type=int, default=1)
    parser.add_argument("--per-request", type=int, default=40)
    parser.add_argument("--seed", type=int, default=int(time.time()))
    parser.add_argument("--offset", type=int, default=0, help="language rotation offset (continue a cycle)")
    parser.add_argument("--languages", help="comma-separated language rotation for tagger emails, e.g. tl,tl,en")
    parser.add_argument("--request-share", type=float, default=0.5, help="share of tagger emails with a request")
    args = parser.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY is not set")
    rng = random.Random(args.seed)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / f"{args.task}.jsonl"
    holdout_path = OUT_DIR / "tagger_holdout.jsonl"
    seen = {
        fingerprint(json.loads(line))
        for path in (out_path, holdout_path) if path.exists()
        for line in path.read_text(encoding="utf-8").splitlines() if line.strip()
    }
    validate = {"tagger": valid_tagger, "rules": valid_rule, "threads": valid_thread}[args.task]

    kept = rejected = 0
    for number in range(1, args.requests + 1):
        if args.task == "tagger":
            cycle = args.languages.split(",") if args.languages else None
            prompt, _ = tagger_prompt(
                rng, args.per_request, batch_language(number + args.offset, cycle), args.request_share
            )
        elif args.task == "rules":
            prompt = rules_prompt(rng, args.per_request)
        else:
            prompt = threads_prompt(rng, args.per_request)
        try:
            text = call_model(args.model, prompt, key)
        except urllib.error.HTTPError as error:
            print(f"request {number}: HTTP {error.code} {error.read()[:200]!r}; stopping")
            break
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"request {number}: {error}; stopping")
            break
        rows = parse_lines(text)
        batch_kept = 0
        for row in rows:
            if args.task == "tagger" and isinstance(row.get("markup"), str):
                row["markup"] = clean_markup(row["markup"])
            if not validate(row):
                rejected += 1
                continue
            mark = fingerprint(row)
            if mark in seen:
                rejected += 1
                continue
            seen.add(mark)
            row["source"] = f"llm:{args.model}"
            target = holdout_path if args.task == "tagger" and int(mark, 16) % 10 == 0 else out_path
            with target.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
            batch_kept += 1
        kept += batch_kept
        print(f"request {number}/{args.requests}: {len(rows)} parsed, {batch_kept} kept", flush=True)
        time.sleep(4)
    print(f"done: {kept} kept, {rejected} rejected -> {out_path}")


if __name__ == "__main__":
    main()
