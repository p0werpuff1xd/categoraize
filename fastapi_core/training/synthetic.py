"""Synthetic TASK/DATE training emails in English, Filipino and Taglish.

Sentences are built from about 30 templates with slots for a task phrase, a
date phrase and filler. The generator knows where it put each phrase, so the
BIO labels are exact. Everything here is invented; no real mailbox content.

Output is markup ("[TASK]...[/TASK]", "[DATE]...[/DATE]"), the same format
team-written and hand-labeled examples use (see data/README.md).
"""

import json
import random
from pathlib import Path

# ---------------------------------------------------------------- task phrases

EN_LEADS = [
    "Please", "please", "Kindly", "kindly", "Can you", "can you", "Could you", "Could you please",
    "Would you", "Pls", "pls", "Plz", "Make sure to", "Don't forget to", "Remember to", "You need to",
    "We need you to", "I need you to", "",
]
EN_ACTIONS = {
    "send": ["the final report", "the signed contract", "your weekly update", "the slides", "the minutes of the meeting",
             "the invoice", "your updated resume", "me the files", "the soft copy"],
    "submit": ["your reflection essay", "the lab report", "the accreditation documents", "your timesheet",
               "the reimbursement form", "the thesis draft", "your requirements", "the incident report"],
    "review": ["the proposal", "the attached budget", "the draft agenda", "the marketing plan", "chapter 2"],
    "sign": ["the permission slip", "the clearance form", "the NDA", "the attendance sheet"],
    "pay": ["the remaining balance", "your tuition fee", "the electricity bill", "the membership fee", "the deposit"],
    "update": ["the project tracker", "the shared spreadsheet", "the inventory sheet", "your profile"],
    "confirm": ["your attendance", "the venue booking", "your slot", "the headcount"],
    "prepare": ["the presentation", "the quarterly numbers", "the room for the meeting", "your talking points"],
    "complete": ["the online survey", "the training module", "the onboarding checklist", "the evaluation"],
    "finish": ["the documentation", "your part of the report", "the test cases"],
    "upload": ["the photos", "your requirements to the portal", "the recording", "the final video"],
    "fill out": ["the registration form", "the evaluation form", "the health declaration"],
    "answer": ["the questionnaire", "the quiz", "the feedback form"],
    "reply to": ["my email", "the client", "the thread"],
    "bring": ["your school ID", "the printed copies", "the extension cord"],
    "check": ["the schedule", "the attached file", "the guest list", "the figures in table 3"],
    "call": ["the supplier", "Ms. Reyes", "the venue"],
    "book": ["the meeting room", "the flights", "a van for the field trip"],
    "return": ["the borrowed books", "the laptop", "the signed forms"],
    "finalize": ["the seating plan", "the budget", "the program flow"],
    "print": ["the handouts", "twenty copies of the module"],
    "settle": ["your account", "the unpaid fees"],
}

TL_VERBS = [
    "ipasa", "isumite", "ipadala", "sagutan", "tapusin", "bayaran", "pirmahan", "i-review", "i-check",
    "i-update", "i-upload", "i-send", "i-submit", "dalhin", "kumpirmahin", "ihanda", "basahin", "ayusin",
    "i-print", "i-finalize",
]
TL_OBJECTS = [
    "ang lab report", "ang final report", "ang form", "yung presentation", "ang assignment ninyo",
    "ang mga requirements", "yung slides", "ang bayad sa kuryente", "ang membership fee", "ang clearance",
    "ang thesis draft", "yung attendance sheet", "ang modules", "ang reaction paper", "yung budget proposal",
    "ang minutes ng meeting", "yung resibo", "ang project plan", "yung tracker", "ang mga dokumento",
]
TL_LEADS = ["Pakisuyong", "pakisuyong", "Kailangan mong", "Kailangan ninyong", "Kailangan nating",
            "Pwede mo bang", "Pwede po bang", "Puwede bang", ""]
PAKI_FORMS = [
    "paki-send", "pakisend", "paki send", "pakicheck", "paki-check", "pakireview", "paki-review", "pakipasa",
    "pakisagutan", "pakibasa", "pakiayos", "pakiprint", "paki-print", "pakidala", "pakiupdate", "paki-upload",
    "pakipirmahan", "pakisubmit", "paki-submit", "pakifinalize", "pakiconfirm", "paki-forward", "pakitapos",
]
TL_INFIX = ["", "", "", " naman", " po", " na"]
PA_FORMS = ["pa-review", "pa-check", "pa-sign", "pa-print", "pa-send", "pacheck", "pa-confirm", "pa-forward", "pa-edit"]
PA_OBJECTS = ["proposal draft", "clearance ko", "leave form ko", "slides natin", "attendance", "budget", "script",
              "certificate ko", "minutes", "invitation letter"]

# Details that stay inside the TASK (object details, destination, "whether" clauses).
EN_DETAILS = [
    "of PHP {amount}", "for {n} guests", "for room {n}", "with the new logo", "for the case study",
    "to the adviser", "to Ms. Cruz", "in the shared drive", "on the portal", "for chapter {n}", "in table {n}",
    "from last quarter", "to the registrar", "for the {n} participants", "on page {n}",
]
EN_CLAUSE_OBJECTS = {
    "confirm": ["if the venue can take {n} guests", "whether the room is free", "if you can join"],
    "check": ["if the totals are correct", "whether the links still work", "if row {n} is right"],
    "let me know": ["if you can attend", "who will join the outreach", "how many copies you need"],
}
TL_DETAILS = [
    "sa drive", "sa group chat", "sa opisina", "sa portal", "ni Sir Tan", "ni Ma'am Reyes", "ko", "mo", "ninyo",
    "tungkol sa kontrata", "sa pahina {n}", "sa buong team", "sa registrar",
]
TL_CLAUSE_OBJECTS = ["kung kumpleto na", "kung sino ang sasama", "kung may bakante pa", "kung tama ang total"]

# Reasons, purposes and conditions after a request: never part of the TASK.
TRAILING_EN = ["to avoid a late fee", "so we can finalize it", "because the client is waiting", "if you have time",
               "when you get the chance", "so I can review it", "since the office closes early"]
TRAILING_TL = ["kasi cut-off na", "para ma-finalize natin", "dahil may audit", "kung may oras ka", "pag-uwi mo",
               "pag nasa office ka na", "ha", "kasi may meeting", "para ma-check ni boss", "dahil naubos na"]

# ---------------------------------------------------------------- date phrases

EN_DATES = [
    "today", "tonight", "tomorrow", "tomorrow morning", "tomorrow afternoon", "tomorrow at 10 AM",
    "tomorrow at 3pm", "this afternoon", "Friday", "this Friday", "next Monday", "Monday morning",
    "Thursday at 3 PM", "Wednesday", "Tuesday", "Wed", "Fri", "end of the day", "EOD", "end of the week",
    "EOW", "end of the month", "next week", "this week", "the day after tomorrow", "Nov 20", "November 20",
    "November 20, 2026", "20 November", "Nov. 18", "11/20", "2026-11-20", "Dec 1 at 9 AM", "December 3",
    "Nov 27 at 5 PM", "Saturday", "next Friday", "coming Thursday", "10 PM", "5pm", "noon", "Thursday night",
    "Monday at 1 PM", "December 15",
]
TL_DATES = [
    "bukas", "bukas ng umaga", "bukas ng hapon", "bukas ng gabi", "bukas ng 3pm", "mamaya", "mamayang gabi",
    "mamayang hapon", "ngayong araw", "ngayon", "sa Lunes", "sa Biyernes", "sa Huwebes ng umaga", "sa Martes",
    "sa Miyerkules", "sa Sabado", "sa susunod na linggo", "katapusan ng buwan", "makalawa", "sa makalawa",
    "ngayong linggo", "Nobyembre 20", "Disyembre 2", "sa susunod na buwan",
]
PAST_DATES_EN = ["yesterday", "last Friday", "last week", "earlier today", "Nov 3", "last Monday"]
PAST_DATES_TL = ["kahapon", "noong Lunes", "noong isang linggo", "kanina"]
EN_CONNECTIVES = ["by", "by", "before", "on or before", "no later than", "until", ""]
TL_CONNECTIVES = ["bago", "hanggang", "", "", ""]

# ---------------------------------------------------------------- filler

GREETINGS_EN = ["Hi team,", "Hello everyone,", "Dear Prof. Lim,", "Hi Carlo,", "Good morning,", "Hello Ma'am,",
                "Hi all,", "Dear Mr. Santos,", "Hey,"]
GREETINGS_TL = ["Magandang umaga po,", "Hello po,", "Hi guys,", "Good morning po!", "Hi Ate,", "Kumusta?",
                "Hello mga ka-team,", "Magandang hapon po,"]
CLOSINGS_EN = ["Thanks!", "Thank you.", "Regards,", "Best,", "Thanks in advance.", "Cheers,"]
CLOSINGS_TL = ["Salamat po!", "Maraming salamat.", "Ingat!", "Salamat!", "God bless po.", "Salamat sa inyo."]
INFO_EN = ["Hope you're doing well.", "FYI, the venue has changed.", "The results are now posted.",
           "The system will be down for maintenance.", "Great job on the launch!", "Let me know if you have questions."]
INFO_TL = ["Sana okay lang kayo.", "Na-post na po ang results.", "Ang galing ng presentation ninyo kahapon.",
           "May bagong memo galing sa admin.", "Sorry sa late reply."]
DECOYS_EN = ["Please find attached the {doc}.", "Kindly be advised that the office follows a new schedule.",
             "Please disregard my previous email.", "Please note that the portal is slow today.",
             "Thank you for submitting your report.", "Can you believe how fast this year went?"]
# Plain news with verbs, numbers and "sa"/"ng" phrases: no TASK, sometimes a DATE.
NEWS_EN = ["Your order #{n} has shipped.", "Attendance is required.", "The class in room {n} is cancelled.",
           "We plan to hold the event {date}.", "Reminder: the assembly is {date}.", "Chapter {n} is due {date}.",
           "There are {n} slots left.", "The total amount is PHP {amount}.", "The meeting moved to room {n}.",
           "Your package should arrive by {date}.", "The links are in the portal.", "Something looks off in row {n}."]
NEWS_TL = ["Cancelled yung class {date} kasi may seminar.", "Due na yung chapter {n} {date}.",
           "Nasa pahina {n} ang sagot.", "Walang pasok {date} dahil sa holiday.",
           "Uuwi kami {date} para sa kaarawan ni Lola.", "May {n} pang slots sa seminar.",
           "Nasa opisina na ang mga papeles.", "Ang total ay PHP {amount}.", "Lunch tayo {date}?",
           "Sarado ang library {date} dahil sa inventory.", "Naiwan ko yung charger sa room {n}."]
DOCS = ["minutes", "updated memo", "receipt", "program", "seat plan"]

LANGUAGES = ("en", "tl", "taglish")


def tag(label: str, text: str) -> str:
    return f"[{label}]{text}[/{label}]"


def fill(rng: random.Random, template: str) -> str:
    amount = f"{rng.randint(100, 25_000):,}" + rng.choice([".00", "", ".50"])
    return template.format(n=rng.randint(2, 450), amount=amount)


def en_task(rng: random.Random) -> str:
    lead = rng.choice(EN_LEADS)
    if rng.random() < 0.12:
        verb = rng.choice(list(EN_CLAUSE_OBJECTS))
        obj = fill(rng, rng.choice(EN_CLAUSE_OBJECTS[verb]))
    else:
        verb = rng.choice(list(EN_ACTIONS))
        obj = rng.choice(EN_ACTIONS[verb])
        if rng.random() < 0.35:
            obj = f"{obj} {fill(rng, rng.choice(EN_DETAILS))}"
    return f"{lead} {verb} {obj}" if lead else f"{verb.capitalize()} {obj}"


def tl_task(rng: random.Random, taglish: bool) -> str:
    obj = rng.choice(TL_OBJECTS)
    if rng.random() < 0.3:
        obj = f"{obj} {fill(rng, rng.choice(TL_DETAILS))}"
    roll = rng.random()
    if roll < 0.12:
        form = rng.choice(PA_FORMS)
        form = form.capitalize() if rng.random() < 0.5 else form
        return f"{form}{rng.choice(['', ' naman', ' na lang', ' po'])} ng {rng.choice(PA_OBJECTS)}"
    if roll < 0.2:
        paki = rng.choice(["pakiconfirm", "pakicheck", "paki-check", "pa-check", "alamin"])
        return f"{paki}{rng.choice(TL_INFIX)} {rng.choice(TL_CLAUSE_OBJECTS)}"
    if roll < 0.6:
        paki = rng.choice(PAKI_FORMS)
        if rng.random() < 0.5:
            paki = paki.capitalize()
        if rng.random() < 0.15:
            obj = f"ng {rng.randint(2, 60)} copies ng {rng.choice(['handout', 'module', 'reviewer', 'form'])}"
        return f"{paki}{rng.choice(TL_INFIX)} {obj}"
    lead = rng.choice(TL_LEADS)
    verb = rng.choice(TL_VERBS)
    if taglish and rng.random() < 0.5:
        verb = rng.choice(["i-send", "i-submit", "i-review", "i-check", "i-update", "i-upload", "i-print"])
    pronoun = rng.choice(["", "", " mo", " ninyo", " niyo na", " mo na"]) if not lead else ""
    return f"{lead} {verb} {obj}" if lead else f"{verb.capitalize()}{pronoun} {obj}"


def date_phrase(rng: random.Random, language: str) -> str:
    if language == "en":
        return rng.choice(EN_DATES)
    if language == "tl":
        return rng.choice(TL_DATES)
    return rng.choice(EN_DATES if rng.random() < 0.4 else TL_DATES)


def task_sentence(rng: random.Random, language: str) -> str:
    """One request sentence; the date may come after, before, or not at all."""
    task = en_task(rng) if language == "en" else tl_task(rng, taglish=language == "taglish")
    if language == "taglish" and rng.random() < 0.3:
        task = en_task(rng)
    date = date_phrase(rng, language)
    tl_like = language != "en"
    connective = rng.choice(TL_CONNECTIVES if tl_like else EN_CONNECTIVES)
    if language == "taglish" and rng.random() < 0.4:
        connective = rng.choice(EN_CONNECTIVES)
    particle = rng.choice([" po", " naman", "", ""]) if tl_like else ""
    end = rng.choice([".", ".", "!", "", "?" if task.lower().startswith(("can", "could", "would", "pwede", "puwede")) else "."])
    trailing = ""
    if rng.random() < 0.3:
        pool = TRAILING_TL if tl_like and rng.random() < 0.8 else TRAILING_EN
        trailing = f"{rng.choice([' ', ', '])}{rng.choice(pool)}"
    shape = rng.random()
    if shape < 0.55:
        middle = f" {connective} " if connective else " "
        return f"{tag('TASK', task)}{particle}{middle}{tag('DATE', date)}{trailing}{end}"
    if shape < 0.75:
        lead_in = f"{connective.capitalize()} " if connective and rng.random() < 0.5 else ""
        date_text = tag("DATE", date if lead_in else date[:1].upper() + date[1:])
        return f"{lead_in}{date_text}, {tag('TASK', task[:1].lower() + task[1:] if rng.random() < 0.5 else task)}{particle}{trailing}{end}"
    if shape < 0.88:
        return f"{tag('TASK', task)}{particle}{trailing}{end}"
    # Deadline stated in its own sentence.
    if tl_like and rng.random() < 0.6:
        deadline = rng.choice([
            f"Ang deadline ay {tag('DATE', date)}.", f"Due na ito {tag('DATE', date)}.",
            f"Kailangan ito {tag('DATE', date)}.",
        ])
    else:
        deadline = rng.choice([
            f"The deadline is {tag('DATE', date)}.", f"It's due {tag('DATE', date)}.",
            f"We need it {tag('DATE', date)}.",
        ])
    return f"{tag('TASK', task)}{particle}{end} {deadline}"


def other_sentence(rng: random.Random, language: str) -> str:
    """Sentences with no TASK: plain info, decoys, past or informational dates."""
    tl_like = language != "en" and (language == "tl" or rng.random() < 0.6)
    roll = rng.random()
    if roll < 0.35:
        news = fill(rng, rng.choice(NEWS_TL if tl_like else NEWS_EN).replace("{date}", "{{date}}"))
        return news.replace("{date}", tag("DATE", date_phrase(rng, "tl" if tl_like else "en")))
    roll = rng.random()
    if roll < 0.3:
        return rng.choice(INFO_TL if tl_like else INFO_EN)
    if roll < 0.55 and not tl_like:
        return rng.choice(DECOYS_EN).format(doc=rng.choice(DOCS))
    if roll < 0.8:
        past = rng.choice(PAST_DATES_TL if tl_like else PAST_DATES_EN)
        options = (
            [f"Na-submit ko na po yung report {tag('DATE', past)}.", f"Nag-meeting kami {tag('DATE', past)}.",
             f"Natanggap ko na ang bayad {tag('DATE', past)}."]
            if tl_like
            else [f"I already sent the report {tag('DATE', past)}.", f"We met with the client {tag('DATE', past)}.",
                  f"Your payment was received {tag('DATE', past)}."]
        )
        return rng.choice(options)
    future = date_phrase(rng, "tl" if tl_like else "en")
    options = (
        [f"Ang meeting ay {tag('DATE', future)}.", f"Sarado ang opisina {tag('DATE', future)}.",
         f"Ang seminar ay gaganapin {tag('DATE', future)}."]
        if tl_like
        else [f"The seminar will be held {tag('DATE', future)}.", f"Our office is closed {tag('DATE', future)}.",
              f"The results come out {tag('DATE', future)}."]
    )
    return rng.choice(options)


def synthetic_email(rng: random.Random, language: str) -> str:
    tl_like = language != "en"
    parts: list[str] = []
    if rng.random() < 0.6:
        parts.append(rng.choice(GREETINGS_TL if tl_like and rng.random() < 0.7 else GREETINGS_EN))
    for _ in range(rng.choice([1, 1, 2, 2, 3])):
        parts.append(task_sentence(rng, language) if rng.random() < 0.7 else other_sentence(rng, language))
    if rng.random() < 0.6:
        parts.append(rng.choice(CLOSINGS_TL if tl_like and rng.random() < 0.7 else CLOSINGS_EN))
    separator = rng.choice([" ", " ", "\n"])
    email = separator.join(parts)
    if rng.random() < 0.15:
        email = _lowercase_outside_tags(email)
    return email


def generate(count: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    return [
        {"lang": (language := LANGUAGES[index % len(LANGUAGES)]), "markup": synthetic_email(rng, language)}
        for index in range(count)
    ]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def _lowercase_outside_tags(markup: str) -> str:
    # Casual emails are often all lowercase; keep the tag names intact.
    return (
        markup.lower()
        .replace("[task]", "[TASK]")
        .replace("[/task]", "[/TASK]")
        .replace("[date]", "[DATE]")
        .replace("[/date]", "[/DATE]")
    )
