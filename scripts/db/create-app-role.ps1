<#
.SYNOPSIS
  Creates (or re-keys) the runtime database role categoraize_app for row-level
  security (IAS Phase 11 K) and points apps\web\.env DATABASE_URL at it.

.DESCRIPTION
  The role can log in and read/write the app's tables but is NOT a superuser
  and has NO BYPASSRLS, so the CategorAIze row-level-security policies apply
  to it. Migrations and maintenance keep using the owner (DIRECT_URL).

  The password is generated here, written only to apps\web\.env (git-ignored)
  and never printed. The previous DATABASE_URL is kept as a comment.
  LOCAL Docker database only; for production, run the SQL in this script by
  hand with a password from your secret store.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\db\create-app-role.ps1
#>
param(
  [string]$Container = 'inbox-zero-services-db-1',
  [string]$Database = 'inboxzero',
  [string]$Role = 'categoraize_app',
  [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'
if (-not $EnvFile) { $EnvFile = Join-Path $PSScriptRoot '..\..\apps\web\.env' }
if (-not (Test-Path $EnvFile)) { throw "Not found: $EnvFile" }

$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
# URL-safe, no characters that need escaping in a connection string.
$password = [Convert]::ToBase64String($bytes).Replace('+', 'A').Replace('/', 'B').TrimEnd('=')

$sql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$Role') THEN
    CREATE ROLE $Role LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END `$`$;
ALTER ROLE $Role WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '$password';
GRANT CONNECT ON DATABASE $Database TO $Role;
GRANT USAGE ON SCHEMA public TO $Role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $Role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $Role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $Role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $Role;
GRANT EXECUTE ON FUNCTION "categorize_users_with_accepted_terms"(text, text) TO $Role;
-- Never let the runtime role change the schema or read Prisma's migration log.
REVOKE CREATE ON SCHEMA public FROM $Role;
REVOKE ALL ON TABLE "_prisma_migrations" FROM $Role;
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '$Role';
"@

$out = $sql | & docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -At 2>&1
if ($LASTEXITCODE -ne 0) { throw "psql failed: $($out -replace [regex]::Escape($password), '***')" }
Write-Host "Role: $(($out | Select-Object -Last 1))  (name | superuser | bypassrls)"

# Point the app at the role; keep the old URL as a comment.
$lines = [IO.File]::ReadAllLines((Resolve-Path $EnvFile))
$dbLine = $lines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $dbLine) { throw 'No DATABASE_URL in the env file' }
$current = ($dbLine -replace '^DATABASE_URL=', '').Trim('"')
$newUrl = $current -replace '://[^@]+@', "://${Role}:$password@"
$updated = foreach ($line in $lines) {
  if ($line -eq $dbLine) {
    if ($current -notmatch "://${Role}:") { "# DATABASE_URL (owner, before IAS Phase 11 K)=$current" }
    "DATABASE_URL=`"$newUrl`""
  } else { $line }
}
[IO.File]::WriteAllLines((Resolve-Path $EnvFile), [string[]]$updated, (New-Object Text.UTF8Encoding $false))
Remove-Variable password, newUrl, bytes
Write-Host "apps\web\.env: DATABASE_URL now uses $Role (password not shown). DIRECT_URL (migrations) unchanged."
Write-Host 'Restart the web app so it reconnects.'
