# Secrets, dependencies and session security (IAS Phase 10 H)

Last reviewed 2026-11-17. Owner: the project team.

## 1. Where secrets live

Secrets are only in environment files that git ignores (`apps/web/.env`,
`.env.local`) and in the hosting dashboards (Vercel, Cloud Run, Supabase).
They are never committed, printed or logged. Values are not listed here.

| Secret | Used by | Rotate when | How to rotate |
| --- | --- | --- | --- |
| `AUTH_SECRET` | better-auth sessions | suspected leak; yearly | new random value in Vercel + `.env`; everyone signs in again |
| `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT` | AES-256-GCM token encryption (`utils/encryption.ts`) | suspected leak | add key version 2 (`KEY_MATERIAL`, `ACTIVE_VERSION` in `utils/encryption.ts`); old rows keep decrypting with v1, new writes use v2; re-save tokens to finish |
| `CATEGORAIZE_INTERNAL_KEY` | web app to NLP service | suspected leak; after any NLP 401 spike (`scripts/audit/review.ps1`) | set the same new value on the service (Cloud Run / local) and the web app at the same time |
| `INTERNAL_API_KEY`, `CRON_SECRET`, QStash keys | internal routes, cron, queue | suspected leak | new value in Vercel and the queue/cron provider |
| `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` | OAuth | suspected leak; Microsoft secrets expire (set a reminder) | create a new secret in Google Cloud / Azure, deploy it, then delete the old one |
| `OPENROUTER_API_KEY` | external LLM (consent only) | suspected leak | new key on openrouter.ai, set a spend limit, delete the old key |
| Supabase database password | `DATABASE_URL`, `DIRECT_URL` | **leaked in git history (b049db249); reset 2026-11-16** | Supabase > Database > Reset password, update both URLs in Vercel |
| Backup age identity | `scripts/backup/` | lost or exposed | see `docs/ias/key-management.md` |

After any rotation: restart the affected services, check `/api/categorai/status`
and the NLP `/healthz`, and note the rotation in the incident record if it
followed an incident.

## 2. Monthly routine (first working day; about 15 minutes)

From the repo root, after `. E:\categoraize\dev-env.ps1`:

```powershell
# 1. Secrets in git history (config adds a rule for database URLs; known,
#    already-rotated findings are listed with reasons in .gitleaksignore)
E:\tools\gitleaks\gitleaks.exe git . --config .gitleaks.toml --redact --no-banner

# 2. npm production dependencies
pnpm audit --prod

# 3. Python dependencies of the NLP service
fastapi_core\.venv\Scripts\python.exe -m pip_audit
```

- A new gitleaks finding: rotate the secret first, then remove it from the
  file; only add it to `.gitleaksignore` (with a dated reason) once rotated.
- High or critical npm advisories: patch within a week. Prefer a
  semver-compatible override in `pnpm-workspace.yaml` with a comment naming
  the advisory, as done for prosemirror-view, source-map-js and zod on
  2026-11-17; the workspace already blocks releases younger than 24 h.
- Moderate and low: review monthly; patch with the next dependency update.
- Python: the service pins its versions in `fastapi_core/requirements*.txt`;
  `torch` (CPU build from the PyTorch index) cannot be checked by pip-audit,
  so read the PyTorch security advisories when updating it.

Last results (2026-11-17): gitleaks clean after review; `pnpm audit --prod`
0 high, 4 moderate (uuid, @hono/node-server, glob, minimatch), 1 low
(deepmerge); pip-audit: only pytest 8.4.2 (a test tool, fix in 9.x).

## 3. Session cookies and OAuth (report only; no change made)

| Item | Finding | Where |
| --- | --- | --- |
| Session cookies | better-auth defaults: HttpOnly, SameSite=Lax, Secure on HTTPS; sessions expire after 30 days, cookie cache 5 minutes | `utils/auth.ts` |
| App cookies (locale, last account) | HttpOnly, SameSite=Lax, Secure in production | `utils/actions/locale.ts`, `utils/actions/email-account-cookie.ts` |
| OAuth state (calendar, Drive, linking) | HMAC-signed state with a nonce, compared in constant time; state cookie HttpOnly, SameSite=Lax, Secure outside development | `utils/oauth/state.ts`, `utils/oauth/callback-validation.ts` |
| PKCE | on for social sign-in (`pkce: true`) | `utils/auth.ts` |
| Security headers | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, enforced CSP with `frame-ancestors 'none'`, Permissions-Policy (added 2026-11-17) | `next.config.ts` |

Suggestions for later (not done): shorten sessions from 30 days for the demo
period; move the CSP away from `'unsafe-inline' 'unsafe-eval'` with nonces
(needs testing against Next.js and the editor).

## 4. Practices outside the code

- Endpoint protection: Windows Defender on, real-time protection on, on every
  machine that holds `.env` files or the backup key.
- OS and browser updates: install monthly at the latest, security updates
  within a week.
- Accounts: two-step verification on GitHub, Google Cloud, Azure, Vercel,
  Supabase and OpenRouter.
- The GitHub repository is public: never paste secrets into issues, docs or
  commit messages.
