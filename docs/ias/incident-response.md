# Incident response: ransomware on the development laptop

Phase 7 F, 2026-11-17. Scenario-based plan following the four NIST SP 800-61
phases (Preparation; Detection and Analysis; Containment, Eradication and
Recovery; Post-Incident Activity). Data restore steps are in
`docs/recovery-runbook.md`; priorities and targets in `docs/ias/bcp.md`.

## Scenario

The Windows laptop that runs CategorAIze (repo on `E:\categoraize\categoraize`,
Docker Postgres, NLP service) is hit by ransomware. Files on `E:` are encrypted
and a ransom note appears. The cloud sync folder that holds backup Copy 2 starts
syncing encrypted files. Personal data at risk: users' email addresses and
names, mail metadata, stored email text in `CategorizeClassification.bodyText`
(plaintext today, control C2), and OAuth tokens (encrypted at rest, C1; the
key `EMAIL_ENCRYPT_SECRET` is in `apps/web/.env` on the same disk).

## Roles

| Role | Who | Duty |
| --- | --- | --- |
| Incident lead | project owner | decisions, timeline, NPC notice |
| Technical responder | developer on duty | containment and restore |
| Data Protection Officer contact | named in the Privacy Notice | breach assessment and notices under RA 10173 |

## 1. Preparation (in place before an incident)

- Encrypted, redacted backups in two places (`scripts/backup/backup.ps1`),
  restore proven weekly (`restore-test.ps1`, `docs/backup-report.md`). Copy 1 on
  an external drive that is **unplugged** between runs; Copy 2 in a cloud
  folder with version history.
- Backup private key stored offline (`docs/ias/key-management.md`); the laptop
  holds only what a restore test needs.
- Append-only audit log (`CategorizeAuditEvent`) for sign-ins, connections,
  consent, deletions, backups and NLP auth failures.
- Secrets inventory and rotation steps (`docs/ias/key-management.md`).
- This document and the runbook are in git, so a clean machine can fetch them
  from GitHub.

## 2. Detection and analysis

Signs: ransom note, files renamed with an unknown extension, Docker or the app
failing to start, backup job failing (`backup_run` audit event with
`status: FAIL`, or no event for a day), checksum failures in a restore test.

First 30 minutes (do not reboot, do not delete anything):

```powershell
# What changed recently on the data and backup disks?
Get-ChildItem E:\categoraize\categoraize, E:\backups -Recurse -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 30 FullName, LastWriteTime, Length

# Are the newest backups still intact? (checksum + age authentication, scratch DB only)
powershell -NoProfile -ExecutionPolicy Bypass -File E:\categoraize\categoraize\scripts\backup\restore-test.ps1 -BackupDir F:\categoraize-backups

# Is the database up, and what did the audit log see?
docker ps -a
'select "createdAt","eventType","userId","emailAccountId",metadata from "CategorizeAuditEvent" order by "createdAt" desc limit 50;' |
  docker exec -i inbox-zero-services-db-1 psql -U postgres -d inboxzero
```

Record in the incident log (time, who, what was seen): first sign, scope (which
folders, whether the database volume and the cloud folder are affected), and
whether data may have been **copied out** (modern ransomware usually steals
before encrypting). Assume exfiltration unless there is evidence against it.
The 72-hour clock below starts at this point.

## 3. Containment

Short term (minutes):

```powershell
# Cut the network so encryption cannot reach the cloud folder or other machines
Get-NetAdapter | Disable-NetAdapter -Confirm:$false
# Stop the app and services; keep containers and volumes as evidence
docker stop inbox-zero-services-db-1 inbox-zero-services-redis-1 inbox-zero-services-serverless-redis-http-1
```

- Unplug the external backup drive if it is connected. Pause cloud sync on
  another device and restore Copy 2 files from the provider's version history
  if they were overwritten.
- From a **different, clean device**: revoke the app's access in each user's
  Google account (Security > Third-party access) and Microsoft account (App
  permissions); reset the Supabase database password (also open item C10a);
  rotate the Google and Microsoft OAuth client secrets.

Long term: assume every secret in `apps/web/.env` is known to the attacker
(`AUTH_SECRET`, `EMAIL_ENCRYPT_SECRET`/`SALT`, `CATEGORAIZE_INTERNAL_KEY`,
OAuth secrets, Upstash and LLM API keys). Rotate them all before the rebuilt
system goes online (`docs/ias/key-management.md`).

## 4. Eradication and recovery

1. Do not pay. Image the disk if a forensic review is wanted, then wipe and
   reinstall Windows (or use a clean machine).
2. Rebuild from trusted sources only: clone the repo from GitHub
   (`git clone` then `git log -1` and compare with the last known commit),
   install Node, pnpm, Docker and Python from their official sites, and age
   from its GitHub release after checking the SHA-256 digest
   (`docs/ias/key-management.md`).
3. Recreate `apps/web/.env` with the **new** secrets. Tokens encrypted with the
   old key cannot be decrypted: users reconnect, which is also wanted after a
   breach.
4. Restore the database from the newest backup that passes its checksum, in
   this order: Copy 1 (external drive), then Copy 2 (cloud version history).
   Follow `docs/recovery-runbook.md` section C, including re-applying erasures.
   A copy that fails the checksum or age authentication is not used.
5. Start the NLP service (model weights come from git; see `docs/ias/bcp.md`
   for the untracked tagger v7 folder), then the web app. Check: sign-in,
   classification of a new email, Security log shows the restore.
6. Turn the network back on only after secrets are rotated and the restore is
   checked. Run `backup.ps1` and `restore-test.ps1` at once.

## 5. Breach notification (RA 10173, NPC Circular 16-03)

Ransomware is a personal data breach when personal data was or may have been
accessed, altered or made unavailable. Notify the National Privacy Commission
and the affected users **within 72 hours of knowing about the breach** when:

- the data includes sensitive personal information or information that could
  enable identity fraud (email content can contain government ID numbers, bank
  or health details; OAuth tokens give mailbox access), and
- the data was, or is reasonably believed to have been, acquired by an
  unauthorized person, and
- there is a real risk of serious harm to the users.

For this scenario all three are presumed true (plaintext email text, possible
exfiltration), so **notify**. If not everything is known by hour 72, send what
is known and update later; a delay must be justified to the NPC.

The notice to the NPC (through its breach notification channel) states: nature
of the breach, personal data involved, number of users affected, measures taken
and planned (containment, token revocation, restore, secret rotation), the
DPO contact, and steps users should take. The notice to users is in plain
language and says what happened, what data, what we did, and what they should
do (review connected apps in their Google/Microsoft account, watch for
phishing, change passwords they reused).

Template opening: "On <date> we found that the computer running CategorAIze
was attacked with ransomware. Your email address, name, and some email
content stored for analysis may have been accessed. We have revoked the app's
access to your mailbox and ..."

Keep the incident log, notices and NPC correspondence for the life of the
project. Check the NPC site for circulars issued after 16-03 before filing.

## 6. Post-incident activity

Within two weeks: timeline from first sign to recovery; measured RTO (from the
stop in step 3 to a working app) and RPO (age of the backup used); what failed
and why; actions with owners. Feed the results into
`docs/ias/control-matrix.md`. Known weaknesses this scenario exposes today:
plaintext email text (C2), secrets on the same disk as the data, Copy 1 and
Copy 2 still on the same disk until the owner points them at separate media,
and the daily backup task not yet registered (A1).
