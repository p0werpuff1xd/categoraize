"""Shared helpers for building the CategorAIze dataset.

Authoring format (one tuple per email):
    (cat, lang, role, vip, "MM-DD HH:MM", subject, body, priority, register[, busy])

Body markup:
    [[T|task text|]]                 an explicit action requested of the recipient
    [[D|date text|CODE]]             a deadline / event time expression, CODE resolves it:
        +N or +N@HH:MM               N days after the received date
        mon..sun or mon@HH:MM        next such weekday strictly after the received date
        nxt:mon                      that weekday of NEXT calendar week
        YYYY-MM-DD or YYYY-MM-DD@HH:MM   absolute
        ?                            ambiguous (no resolved value)
        (empty)                      no resolved value, not flagged ambiguous
"""
import datetime as dt
import json
import re
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Manila")

CATEGORY_SLUG = {
    "WORK": "work_tasks", "MEET": "meetings", "SCHOOL": "school", "JOB": "job_search",
    "FIN": "finance_billing", "PROMO": "promotions", "ALERT": "alerts", "PERSONAL": "personal",
}
CATEGORY_INFO = {
    "work_tasks": ("Work", "Work requests, task assignments, deliverables, project updates, and code or report reviews from colleagues, managers or clients."),
    "meetings": ("Meetings", "Meeting invitations, rescheduling, availability requests, and coordination of calls, appointments and get-togethers with colleagues or vendors."),
    "school": ("School", "Classes, assignments, exams, deadlines, grades, enrollment and messages from instructors, classmates or the school office."),
    "job_search": ("Job Search", "Job applications, interview invitations, recruiter messages, assessments, job offers, requirements and job alerts."),
    "finance_billing": ("Finance and Billing", "Bills, invoices, payments, receipts, refunds, subscriptions and expense reports."),
    "promotions": ("Promotions and Newsletters", "Marketing offers, sales, discounts, abandoned carts, newsletters, webinars and referral programs from companies."),
    "alerts": ("Alerts and Notifications", "Automated notifications: security sign-in alerts, delivery updates, system and server alerts, storage and account notices."),
    "personal": ("Personal", "Messages from family and friends: invitations, plans, photos, reunions and casual conversation."),
}
ROLE = {"M": "Manager", "D": "Director/Executive", "R": "Direct Report", "V": "External Vendor", "O": "Other"}
REGISTER = {"f": "formal", "n": "neutral", "c": "casual"}
LANGS = ("en", "mixed", "tl")
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
MARKUP = re.compile(r"\[\[(T|D)\|([^|\]]*)\|([^\]]*)\]\]")


def parse_received(s):
    mm_dd, hh_mm = s.split(" ")
    m, d = map(int, mm_dd.split("-"))
    h, mi = map(int, hh_mm.split(":"))
    return dt.datetime(2026, m, d, h, mi, tzinfo=TZ)


def _resolve_day(code, received):
    d = received.date()
    if code.startswith("+"):
        return d + dt.timedelta(days=int(code[1:]))
    if code.startswith("nxt:"):
        idx = WEEKDAYS.index(code[4:])
        monday = d + dt.timedelta(days=7 - d.weekday())
        return monday + dt.timedelta(days=idx)
    if code in WEEKDAYS:
        delta = (WEEKDAYS.index(code) - d.weekday()) % 7 or 7
        return d + dt.timedelta(days=delta)
    return dt.date.fromisoformat(code)


def resolve(code, received):
    """Return (resolved_or_None, ambiguous)."""
    code = code.strip()
    if code == "?":
        return None, True
    if code == "":
        return None, False
    time = None
    if "@" in code:
        code, time = code.split("@")
    day = _resolve_day(code, received)
    if time:
        h, mi = map(int, time.split(":"))
        return dt.datetime(day.year, day.month, day.day, h, mi, tzinfo=TZ).isoformat(), False
    return day.isoformat(), False


def parse_markup(body, received):
    out, spans, last, length = [], [], 0, 0
    for m in MARKUP.finditer(body):
        chunk = body[last:m.start()]
        out.append(chunk)
        length += len(chunk)
        text = m.group(2)
        span = {"label": "TASK" if m.group(1) == "T" else "DATE", "text": text,
                "start": length, "end": length + len(text)}
        if m.group(1) == "D":
            span["resolved"], span["ambiguous"] = resolve(m.group(3), received)
        spans.append(span)
        out.append(text)
        length += len(text)
        last = m.end()
    out.append(body[last:])
    clean = "".join(out)
    for s in spans:
        assert clean[s["start"]:s["end"]] == s["text"], (s, clean)
    assert "[[" not in clean and "]]" not in clean, clean
    return clean, spans


def parse_busy(spec, received):
    """spec like 'thu@13:30-15:00' or '+1@15:00-16:30'."""
    if not spec:
        return []
    day_code, rng = spec.split("@")
    start_s, end_s = rng.split("-")
    day = _resolve_day(day_code, received)
    sh, sm = map(int, start_s.split(":"))
    eh, em = map(int, end_s.split(":"))
    return [{"start": dt.datetime(day.year, day.month, day.day, sh, sm, tzinfo=TZ).isoformat(),
             "end": dt.datetime(day.year, day.month, day.day, eh, em, tzinfo=TZ).isoformat()}]


def has_conflict(spans, busy):
    for s in spans:
        r = s.get("resolved")
        if s["label"] == "DATE" and r and len(r) > 10:
            t = dt.datetime.fromisoformat(r)
            for b in busy:
                if dt.datetime.fromisoformat(b["start"]) <= t < dt.datetime.fromisoformat(b["end"]):
                    return True
    return False


def build_record(split, source, lang_expected, idx, tup):
    cat, lang, role, vip, recv, subject, body, pri, reg = tup[:9]
    busy_spec = tup[9] if len(tup) > 9 else None
    assert lang == lang_expected or lang_expected is None, (lang, lang_expected, subject)
    received = parse_received(recv)
    clean, spans = parse_markup(body, received)
    busy = parse_busy(busy_spec, received)
    return {
        "id": f"{split}-{lang}-{idx:03d}",
        "split": split,
        "source": source,
        "human_reviewed": False,
        "language": lang,
        "subject": subject,
        "body": clean,
        "sender_role": ROLE[role],
        "is_vip": bool(vip),
        "received_at": received.isoformat(),
        "gold_category": CATEGORY_SLUG[cat],
        "gold_spans": spans,
        "gold_priority": pri,
        "gold_register": REGISTER[reg],
        "calendar_busy": busy,
        "gold_calendar_conflict": has_conflict(spans, busy),
    }


def shingles(text, n=3):
    words = re.findall(r"\w+", text.lower())
    if len(words) < n:
        return {" ".join(words)}
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def jaccard(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
