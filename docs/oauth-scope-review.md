# OAuth scope review

Phase 7 C, 2026-11-17. Least-privilege review of every Google and Microsoft
scope the app requests (control-matrix C11). **Nothing was removed**: the
verdicts are recommendations for the owner.

- **KEEP**: CategorAIze or a feature the user switches on needs it, and no
  narrower scope does the job.
- **REMOVE**: not needed; a narrower scope already covers the use.
- **ASK**: only an upstream (Inbox Zero) feature needs it, or it is broader than
  CategorAIze needs; the owner decides whether that feature stays.

Sources: `apps/web/utils/gmail/scopes.ts`, `utils/outlook/scopes.ts`,
`utils/drive/scopes.ts`. Paths below are relative to `apps/web/`.

## Google: sign-in and mailbox (`SCOPES` in `utils/gmail/scopes.ts`)

| Scope | Used by | Verdict |
| --- | --- | --- |
| `userinfo.profile`, `userinfo.email` | sign-in identity (Better Auth) | KEEP |
| `gmail.modify` | read mail for classification; apply CategorAIze labels, archive, mark read (`utils/gmail/*`) | KEEP. `gmail.readonly` cannot apply labels; `gmail.labels` cannot read messages. |
| `gmail.settings.basic` | upstream only: Gmail filters from rules (`utils/gmail/filter.ts`), forwarding addresses (`utils/gmail/settings.ts`), signatures via sendAs (`utils/gmail/signature-settings.ts`) | ASK. CategorAIze does not use it. It is a restricted scope (Google security assessment for public apps). |
| `contacts` (only when `NEXT_PUBLIC_CONTACTS_ENABLED`) | upstream contact suggestions (`utils/gmail/contact.ts`) | ASK. CategorAIze keeps its own contact list (`CategorizeContact`). |
| `contacts.other.readonly` (only with the flag above and `NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED`) | upstream recipient suggestions | ASK (same reason) |

## Google: calendar (`CALENDAR_SCOPES`, separate connection)

| Scope | Used by | Verdict |
| --- | --- | --- |
| `userinfo.profile`, `userinfo.email` | identify the calendar account | KEEP |
| `calendar.readonly` | upstream upcoming events and meeting briefs; CategorAIze busy times (`utils/categoraize/calendar-busy.ts`) | KEEP while meeting briefs stay; otherwise `calendar.freebusy` alone is enough for CategorAIze (ASK) |
| `calendar.events` | upstream event creation and edits: booking links (`utils/booking/public.ts`), invitations (`utils/calendar/invitations/service.ts`), assistant chat tools (`utils/ai/assistant/chat-calendar-tools.ts`) via `utils/calendar/providers/google-events.ts` | ASK. CategorAIze only reads busy times. If confirmed deadlines are to become calendar events (plan section on deadlines), keep it; otherwise request it only when the user turns on a write feature. |
| `calendar.freebusy` | availability for booking links (`utils/calendar/providers/google-availability.ts`) | ASK: covered by `calendar.readonly` while that is kept, so one of the two is redundant. |

## Microsoft: sign-in and mailbox (`SCOPES` in `utils/outlook/scopes.ts`)

| Scope | Used by | Verdict |
| --- | --- | --- |
| `openid`, `profile`, `email`, `User.Read` | sign-in identity | KEEP |
| `offline_access` | refresh tokens for background processing | KEEP |
| `Mail.ReadWrite` | read mail for classification; set categories, move, mark read | KEEP. `Mail.Read` cannot apply categories. |
| `Mail.Send` (only when `NEXT_PUBLIC_EMAIL_SEND_ENABLED`) | upstream sending and replies | ASK. CategorAIze never sends mail. |
| `MailboxSettings.ReadWrite` | CategorAIze reads the mailbox time zone (`utils/categoraize/mailbox-timezone.ts`); Outlook master categories are created for labels (`utils/outlook/label.ts`) and auto-replies (`utils/email/microsoft.ts`) | KEEP: creating master categories (CategorAIze labels on Outlook) needs write. |
| `Contacts.Read`, `People.Read` (only when `NEXT_PUBLIC_CONTACTS_ENABLED`) | upstream contact suggestions | ASK |

## Microsoft: calendar (`CALENDAR_SCOPES`)

| Scope | Used by | Verdict |
| --- | --- | --- |
| `openid`, `profile`, `email`, `User.Read`, `offline_access` | identify the calendar account, refresh | KEEP |
| `Calendars.Read` | busy times and upcoming events | REMOVE (recommended): `Calendars.ReadWrite` below already includes read. If `Calendars.ReadWrite` is dropped instead, KEEP this one. |
| `Calendars.ReadWrite` | upstream event creation (`utils/calendar/providers/microsoft-events.ts`) | ASK, same decision as Google `calendar.events` |

## Drive (`utils/drive/scopes.ts`, separate opt-in connection for attachment filing)

| Scope | Used by | Verdict |
| --- | --- | --- |
| Microsoft `openid`, `profile`, `email`, `User.Read`, `offline_access` | identify the Drive account, refresh | KEEP |
| Microsoft `Files.ReadWrite` | upstream attachment filing into OneDrive | ASK. Not used by CategorAIze; filing is opt-in. `Files.ReadWrite.All` is already avoided. |
| Google `userinfo.profile`, `userinfo.email`, `drive.file` (default) | attachment filing, only files the app created or the user picked | KEEP while filing stays; this is the least-privilege Drive scope |
| Google `drive` (`GOOGLE_DRIVE_FULL_SCOPES`, only when `accessLevel === "full"` in `utils/drive/client.ts`) | full Drive access for filing into existing folders | ASK. Broadest scope in the app (restricted scope); no CategorAIze feature needs it. |

## Summary and decisions for the owner

1. CategorAIze itself needs only: Google `userinfo.*`, `gmail.modify`,
   `calendar.freebusy` (or `calendar.readonly`); Microsoft `openid`, `profile`,
   `email`, `User.Read`, `offline_access`, `Mail.ReadWrite`,
   `MailboxSettings.ReadWrite`, `Calendars.Read`.
2. Everything marked ASK belongs to upstream features (filters, signatures,
   contacts, sending, event creation, Drive filing). Decide per feature whether
   it stays in the capstone build; drop the scope with the feature.
3. Two redundant pairs can go with no feature loss: Microsoft `Calendars.Read`
   alongside `Calendars.ReadWrite`, and Google `calendar.freebusy` alongside
   `calendar.readonly` (keep whichever matches decision 2).
4. Changing scopes forces existing users to re-consent; the app records
   `oauth_scope_changed` audit events when calendar or Drive connections are
   saved.
