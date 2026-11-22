# Recovery runbook (CategorAIze local database)

Phase 7 A. For the incident process around a restore (who decides, who is told)
see `docs/ias/incident-response.md`; for priorities and targets see
`docs/ias/bcp.md`. Measured times are in `docs/backup-report.md`.

Targets: **RPO 24 h** (one backup a day, once the scheduled task below is
registered) and **RTO 4 h**. Measured on 2026-11-17 (three runs, 2026-11-16/17):
backup 127 to 147 s, restore of the data into a fresh database 113 to 115 s
(`docs/backup-report.md`).

## What a backup contains

- Full schema of every table (empty tables included), so a restore is a
  complete, migratable database.
- Rows of the CategorAIze tables (`Categorize*`) and the settings and identity
  rows they depend on: `User`, `EmailAccount`, `Account`, `Premium`,
  `Category`, plus `_prisma_migrations`.
- **Not included:** email bodies, snippets, subjects, summaries, extracted span
  text, deadline source text and notification text (blanked); OAuth tokens,
  passwords, API keys and webhook secrets (blanked); rows of every other upstream
  table (mail cache, rules, chats, calendar/drive connections, ...).

Consequences after a restore: users sign in again and reconnect their mailbox,
calendar and Drive (no tokens were kept); labels, categories, priorities,
contacts, consent history and the audit log are back; stored emails show their
category and priority but no text, and new mail is processed normally.

## Backup files

Each set has three read-only files with the same dated name, in **Copy 1**
(external drive) and **Copy 2** (off-site cloud folder):

```
categoraize-YYYYMMDD-HHMMSS.dump.age       encrypted pg_dump (custom format)
categoraize-YYYYMMDD-HHMMSS.manifest.json  row counts, schema version, redacted columns
categoraize-YYYYMMDD-HHMMSS.sha256         checksums of the two files above
```

## A. Routine checks

```powershell
# Daily backup (what the scheduled task runs)
powershell -NoProfile -ExecutionPolicy Bypass -File E:\categoraize\categoraize\scripts\backup\backup.ps1 -Copy1 F:\categoraize-backups -Copy2 "$env:USERPROFILE\OneDrive\categoraize-backups"

# Weekly: prove the newest backup restores (updates docs/backup-report.md)
powershell -NoProfile -ExecutionPolicy Bypass -File E:\categoraize\categoraize\scripts\backup\restore-test.ps1 -BackupDir F:\categoraize-backups
```

Logs: `E:\backups\logs\backup-YYYYMMDD.log` and `restore-test-YYYYMMDD.log`.
Every run also adds a `backup_run` or `restore_test` row to the audit log
(Settings > Privacy > Security log).

## B. Schedule the daily backup (not registered yet; the owner runs this once)

Docker Desktop must be running, so the task runs as the signed-in user.

```powershell
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "E:\categoraize\categoraize\scripts\backup\backup.ps1" -Copy1 "F:\categoraize-backups" -Copy2 "C:\Users\<you>\OneDrive\categoraize-backups"'
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskPath '\CategorAIze\' -TaskName 'Daily backup' -Action $action -Trigger $trigger -Settings $settings
```

Replace `F:\...` with the external drive and `C:\Users\<you>\OneDrive\...` with
the off-site sync folder. Check it with
`Get-ScheduledTaskInfo -TaskPath '\CategorAIze\' -TaskName 'Daily backup'`
(`LastTaskResult` 0 = success).

## C. Restore after data loss (local Docker database)

1. **Stop writes.** Stop the web app (`Ctrl+C` in the `pnpm dev` terminal) and
   the NLP service. Note the time: it is the start of the RTO clock.
2. **Keep the broken database.** Do not delete `inbox-zero-services-db-1` or its
   volume; it is evidence and a fallback. If it still runs, take a backup of it
   first (`backup.ps1` with a separate `-Copy1`/`-Copy2`).
3. **Pick and verify the set.** Use the newest set from Copy 1; if Copy 1 is
   lost or fails its checksum, use Copy 2. `restore-test.ps1 -BackupDir <copy>`
   verifies checksum, decryption and row counts without touching anything else.
   A set that fails the checksum is **never** restored (tampered or corrupt).
4. **Restore into a new container:**

   ```powershell
   $set = 'categoraize-YYYYMMDD-HHMMSS'; $src = 'F:\categoraize-backups'; $work = 'E:\tmp\restore'
   New-Item -ItemType Directory -Force $work | Out-Null
   E:\tools\age\age.exe -d -i E:\keys\categoraize-backup\age-identity.txt -o "$work\$set.dump" "$src\$set.dump.age"
   docker volume create categoraize-db-restored
   docker run -d --name categoraize-db-restored -p 127.0.0.1:5433:5432 -e POSTGRES_PASSWORD=<new local password> -e POSTGRES_DB=inboxzero -v categoraize-db-restored:/var/lib/postgresql/data -v "${work}:/work" pgvector/pgvector:pg16
   docker exec categoraize-db-restored pg_restore -U postgres -d inboxzero --no-owner --exit-on-error "/work/$set.dump"
   Remove-Item "$work\$set.dump"   # do not leave the decrypted dump on disk
   ```

5. **Point the app at it.** In `apps/web/.env`, set the local `DATABASE_URL`
   (and `DIRECT_URL` if present) to port 5433 with the new password. Never point
   it at Supabase. Then bring the schema up to date:
   `cd apps/web; pnpm prisma migrate deploy`.
6. **Start and check.** Start the NLP service and `pnpm dev`, sign in, reconnect
   the mailbox, open CategorAIze: categories, contacts and priorities are back;
   Settings > Privacy > Security log shows the old events.
7. **Re-apply erasures.** The Privacy Notice promises that deleted accounts stay
   deleted after a restore. Accounts deleted after the backup was taken are
   only in the **old** database's audit log (the restored copy predates
   them), so read them from there and delete them from the restored one:

   ```powershell
   # Dry run first; -Since is the backup's createdAt from its manifest.
   .\scripts\backup\reapply-deletions.ps1 -TargetContainer <restored> `
     -SourceContainer <old> -Since '<backup createdAt>' -DryRun
   .\scripts\backup\reapply-deletions.ps1 -TargetContainer <restored> `
     -SourceContainer <old> -Since '<backup createdAt>'
   ```

   If the old database cannot be read, pass the IDs you collected from the
   incident notes with `-UserIds id1,id2`. The script refuses the live
   container unless `-AllowLiveTarget` is given (only after the restore has
   replaced it), deletes each `User` row (cascading to its email accounts and
   all CategorAIze rows), and fails if any row is left. Drilled on
   2026-11-17 against a restored scratch copy: 1 user, 1 email account,
   1 category, 5 classifications and 1 consent row removed; the other user's
   rows untouched.
8. **Record it.** Note the stop time (RTO), the backup time used (RPO), and the
   steps that went wrong in the incident record; keep the old container until
   the restored one has run for a week.

## D. If the age identity is lost

Backups cannot be decrypted; there is no recovery. Create a new key pair
(`docs/ias/key-management.md`), run a backup at once, and keep using the live
database. This is why an offline copy of the identity is required.
