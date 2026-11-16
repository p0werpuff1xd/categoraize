# Business continuity plan (CategorAIze)

Phase 7 F, 2026-11-17. What must keep working, in what order to bring it back,
and how fast. Restore mechanics: `docs/recovery-runbook.md`; incident handling:
`docs/ias/incident-response.md`.

## Critical function

**Users can open and read their mail, and incoming mail is labelled and
prioritized by CategorAIze.** The first half is critical (people rely on their
inbox); the second half is important but can be degraded: when the NLP service
is down, mail still opens and shows a neutral "Not yet analyzed" state
(control A3), and emails are classified once the service is back.

| Component | Role | Can run degraded? |
| --- | --- | --- |
| Gmail / Outlook (provider) | holds the mail itself | not ours; mail is never lost by our outage |
| Postgres (`inbox-zero-services-db-1`) | users, accounts, categories, classifications, consent, audit log | no: needed for sign-in |
| Web app (`apps/web`) | UI, webhooks, classification pipeline | no |
| Redis + HTTP proxy | caching, OAuth dedup, queues | yes: rebuilt empty |
| NLP service (`fastapi_core`) | embeddings, classifier, tagger | yes: app falls back to "Not yet analyzed" |

## Restore order

1. **Secrets** (`apps/web/.env`, FastAPI env, age identity) from the password
   manager or offline copy; rotate them after a breach.
2. **Postgres** from the newest backup that passes its checksum (Copy 1, then
   Copy 2), into a new container; `pnpm prisma migrate deploy`.
3. **Redis** containers (`docker compose up` for the services; data is not
   restored).
4. **Web app** (`pnpm install`, `pnpm dev` or the production build), then
   sign in and reconnect mailboxes (tokens are not in backups).
5. **NLP service** (`fastapi_core\.venv`, model weights from git). Note:
   `fastapi_core/models/tagger/v7/` is **untracked** and not in any backup; if
   the laptop is lost, that model must be retrained or the service falls back
   to the committed version. Decision for the owner: commit it, store it with
   the backups, or accept retraining.
6. Re-apply erasures made after the backup (runbook step C.7), run a backup and
   a restore test.

## Targets and measurements

| | Target | Measured (2026-11-16/17, local, `docs/backup-report.md`) |
| --- | --- | --- |
| RPO (data loss) | 24 h | 24 h once the daily task is registered; **not met today**: no scheduled task, so the RPO is the time since the last manual run |
| RTO (time to restore) | 4 h | data restore into a fresh database: 113 to 115 s over two runs (checksum + decrypt 0.1 s, start DB 12 to 15 s, `pg_restore` 100 s, checks under 1 s). Full service RTO (secrets, app, reconnecting mailboxes) not drilled; estimated under 1 h on a working machine, longer if Windows must be reinstalled |
| Backup run | n/a | 127 to 147 s over three runs (most of it copying the full schema into the staging DB) |
| Backup copies | 2 (3-2-1) | 2 folders written and verified, **both on the same disk** until the owner points them at the external drive and the cloud folder |

## Testing

- Weekly: `restore-test.ps1` (checksums, decrypt, restore, row counts,
  redaction, append-only audit log, tamper refusal).
- Each semester: a tabletop of the ransomware scenario in
  `docs/ias/incident-response.md`, timing the full service RTO.

## Open decisions for the owner

1. Register the daily backup task (`docs/recovery-runbook.md` section B) with
   Copy 1 on the external drive and Copy 2 in the cloud folder.
2. What to do about `fastapi_core/models/tagger/v7/` (see restore order 5).
3. Whether production (Supabase) needs its own backup plan; these scripts only
   cover the local Docker database by design.
