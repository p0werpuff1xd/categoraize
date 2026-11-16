# Key management

Status 2026-11-16 (Phase 7 A). Covers the keys this repository's security
controls depend on. **No key value appears in this file or anywhere in git.**

## 1. Backup encryption key (age, X25519)

| Item | Where | Who needs it |
| --- | --- | --- |
| Public key (recipient, `age1...`) | `E:\keys\categoraize-backup\age-recipient.txt`; also printed in every backup manifest | `scripts/backup/backup.ps1` (encrypts only) |
| Private key (identity, `AGE-SECRET-KEY-...`) | `E:\keys\categoraize-backup\age-identity.txt` (outside the repo; folder ACL: the Windows user and SYSTEM only) | `scripts/backup/restore-test.ps1` and a real restore |
| Tool | `E:\tools\age` (age v1.3.2, Windows amd64, SHA-256 `f48d8f8f9ebe903ab5027ed067652f2cc1db94bc206976430133b905dcd8e8c7` checked against the digest GitHub publishes for the release asset) | both scripts |

Why a key pair and not a passphrase: `age -p` only reads a passphrase from a
terminal, so it cannot run unattended from Task Scheduler. With a key pair the
nightly job needs only the public key; someone who steals a backup copy and the
backup script still cannot read it.

**Action for the owner (open):**

1. Store an offline copy of `age-identity.txt` now (password manager secure
   note, or a USB key kept away from the external backup drive). If the only
   copy is lost with the laptop, **every backup becomes unreadable**.
2. Never put the identity file next to Copy 1 or Copy 2, never commit it, never
   paste it into chat or an issue.

**Rotation** (yearly, or at once if the identity may have leaked):

```powershell
E:\tools\age\age-keygen.exe -o E:\keys\categoraize-backup\age-identity-2027.txt
E:\tools\age\age-keygen.exe -y E:\keys\categoraize-backup\age-identity-2027.txt |
  Set-Content -Encoding ascii E:\keys\categoraize-backup\age-recipient.txt
```

Keep the old identity until retention has removed every backup made with it
(at most 4 weeks with the 7 daily + 4 weekly policy), then destroy it. Run
`restore-test.ps1 -IdentityFile <new file>` after the first backup with the new
key. If a leak is suspected, also treat existing copies as exposed (they hold
user emails and names, but no email bodies or OAuth tokens) and follow
`docs/ias/incident-response.md`.

## 2. Application secrets (in `apps/web/.env`, never committed)

| Secret | Protects | Rotation note |
| --- | --- | --- |
| `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT` | AES-256-GCM encryption of OAuth tokens at rest (`utils/encryption.ts`) | Rotating makes stored tokens unreadable: users must reconnect. Backups do not contain tokens, so they are unaffected. |
| `AUTH_SECRET` (Better Auth) | session cookies and signed OAuth state | Rotating signs everyone out. |
| `CATEGORAIZE_INTERNAL_KEY` | web app to NLP service calls (`X-Internal-Key`) | Change in both `apps/web/.env` and the FastAPI environment, restart both. 401s show up as `nlp_auth_failure_count` audit events. |
| Google / Microsoft OAuth client secrets | sign-in and mailbox access | Rotate in the provider console, update `.env`. |
| Supabase database password | production database | **Must be reset** (control-matrix C10a: it is in public git history). Not used by local development. |

## 3. Rules

- Secrets live only in `.env` files, the key folder above, or a password
  manager. `.gitignore` covers `.env*`; gitleaks runs over the history
  (control C10).
- Scripts never print secrets. The backup scripts reach the local database via
  Docker's trusted loopback, so they hold no database password at all.
- The audit log (`CategorizeAuditEvent`) never stores tokens, secrets or IP
  addresses (`sanitizeAuditMetadata`, tested in `utils/categoraize/audit.test.ts`).
