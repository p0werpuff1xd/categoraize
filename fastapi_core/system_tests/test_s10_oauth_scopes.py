"""S10: the OAuth scopes the web app requests match the documented least-privilege list.

The documented list is docs/oauth-scope-review.md ("Decisions applied"). This
reads the scope arrays straight from the TypeScript sources, so a scope added in
code without updating the review fails here.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

WEB = Path(__file__).resolve().parents[2] / "apps" / "web" / "utils"

# Documented (oauth-scope-review.md). Optional = behind an env flag or an opt-in feature.
DOCUMENTED = {
    ("gmail/scopes.ts", "REQUIRED_SCOPES"): {
        "https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.settings.basic"},
    ("gmail/scopes.ts", "CALENDAR_SCOPES"): {
        "https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"},
    ("outlook/scopes.ts", "REQUIRED_SCOPES"): {
        "openid", "profile", "email", "User.Read", "offline_access", "Mail.ReadWrite",
        "MailboxSettings.ReadWrite", "Mail.Send"},
    ("outlook/scopes.ts", "CALENDAR_SCOPES"): {
        "openid", "profile", "email", "User.Read", "offline_access", "Calendars.ReadWrite"},
    ("drive/scopes.ts", "GOOGLE_DRIVE_SCOPES"): {
        "https://www.googleapis.com/auth/userinfo.profile", "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/drive.file"},
    ("drive/scopes.ts", "MICROSOFT_DRIVE_SCOPES"): {
        "openid", "profile", "email", "User.Read", "offline_access", "Files.ReadWrite"},
}
NEVER = {"https://mail.google.com/", "Mail.ReadWrite.Shared", "Files.ReadWrite.All", "Calendars.Read",
         "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.freebusy",
         "Directory.Read.All", "User.Read.All"}


def scopes_in(file: str, const: str) -> set[str]:
    source = (WEB / file).read_text(encoding="utf-8")
    block = re.search(rf"export const {const} = \[(.*?)\]( as const)?;", source, re.S)
    assert block, f"{const} not found in {file}"
    body = re.sub(r"(?<!:)//[^\n]*", "", block.group(1))  # comments, not "https://"
    return set(re.findall(r'"([^"]+)"', body))


@pytest.mark.parametrize("key", list(DOCUMENTED), ids=[f"S10-D{i + 1:02d} {f}:{c}" for i, (f, c) in enumerate(DOCUMENTED)])
def test_scopes_match_the_documented_list(case, key):
    actual = scopes_in(*key)
    case(f"{key[0]} {key[1]}", sorted(DOCUMENTED[key]), sorted(actual))
    assert actual == DOCUMENTED[key]
    assert not actual & NEVER
