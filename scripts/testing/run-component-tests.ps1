<#
.SYNOPSIS
  Runs every component (unit) test and regenerates docs/testing (Prompt A).

.DESCRIPTION
  1. NLP service: pytest with coverage -> results/pytest.xml, coverage/nlp/
  2. Web logic: Vitest (Node 24) with v8 coverage -> results/vitest.xml, coverage/web/
  3. Database (local Docker Postgres only, every test ROLLED BACK):
     scripts/db/test-rls.sql and test-erasure.sql -> results/db-*.txt
  4. Optional backup restore dry run (-WithRestore) -> results/db-restore.txt
  5. scripts/testing/make_component_report.py -> component_tests.md, traceability.csv

  Never point this at the production database: the DB tests run through
  `docker exec` on the local container only.
#>
[CmdletBinding()]
param(
  [string]$Python = 'E:\categoraize\categoraize\fastapi_core\.venv\Scripts\python.exe',
  [string]$Fnm = 'C:\Users\Lauren\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe',
  [string]$DbContainer = 'inbox-zero-services-db-1',
  [switch]$WithRestore
)
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$results = Join-Path $root 'docs\testing\results'
$coverage = Join-Path $root 'docs\testing\coverage'
New-Item -ItemType Directory -Force -Path $results, "$coverage\nlp", "$coverage\web" | Out-Null

Write-Host '== 1. NLP service (pytest)'
Push-Location (Join-Path $root 'fastapi_core')
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
& $Python -m pytest tests -q -p no:cacheprovider -W ignore -o addopts="" -o junit_family=xunit1 `
  --junitxml="$results\pytest.xml" --cov=app --cov-report="xml:$coverage\nlp\coverage.xml" `
  --cov-report="html:$coverage\nlp\html" --cov-report=term
Pop-Location

Write-Host '== 2. Web logic (Vitest)'
Push-Location (Join-Path $root 'apps\web')
$env:RUN_AI_TESTS = 'false'
$webTests = @(
  'utils/categoraize/triage-order.test.ts', 'utils/categoraize/rating-state.test.ts',
  'components/CategoraizePriority.test.tsx', 'utils/categoraize/consent.test.ts',
  'utils/categoraize/features.test.ts', 'utils/categoraize/pii.test.ts',
  'utils/categoraize/field-encryption.test.ts', 'utils/categoraize/audit.test.ts',
  'utils/categoraize/data-export.test.ts', 'utils/user/delete.test.ts',
  'utils/categoraize/revoke-tokens.test.ts'
)
$covered = @(
  'utils/categoraize/triage-order.ts', 'utils/categoraize/rating-state.ts',
  'components/CategoraizePriority.tsx', 'utils/categoraize/consent.ts',
  'utils/categoraize/pii.ts',
  'utils/categoraize/field-encryption.ts', 'utils/categoraize/audit.ts',
  'utils/categoraize/data-export.ts', 'utils/categoraize/revoke-tokens.ts'
) | ForEach-Object { "--coverage.include=$_" }
& $Fnm exec --using=24 -- node node_modules\vitest\vitest.mjs run @webTests --testTimeout=30000 `
  --reporter=default --reporter=junit --outputFile.junit="$results\vitest.xml" `
  --coverage.enabled --coverage.provider=v8 @covered `
  --coverage.reporter=html --coverage.reporter=json-summary --coverage.reporter=text-summary `
  --coverage.reportsDirectory="$coverage\web"
Pop-Location

Write-Host '== 3. Database (rolled back)'
foreach ($name in 'rls', 'erasure') {
  Get-Content (Join-Path $root "scripts\db\test-$name.sql") -Raw |
    docker exec -i $DbContainer psql -U postgres -d inboxzero -At 2>&1 |
    ForEach-Object { "$_" } | Set-Content -Encoding utf8 "$results\db-$name.txt"
}

if ($WithRestore) {
  Write-Host '== 4. Backup restore dry run'
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\backup\restore-test.ps1') `
    -ReportPath "$results\backup-report.md"
  $md = Get-Content "$results\backup-report.md" -Raw
  function PF($ok) { if ($ok) { 'PASS' } else { 'FAIL' } }
  @(
    "$(PF ($md -match '\| Result \| \*\*PASS\*\*')) C12-30 encrypted backup restores into a scratch database (live DB untouched)",
    "$(PF ($md -match '## Row counts' -and $md -notmatch '\*\*NO\*\*')) C12-31 restored row counts match the manifest",
    "$(PF ($md -match 'Checked in the restored database: \*\*all empty\*\*')) C12-32 email content and secret columns are empty in the backup",
    "$(PF ($md -match 'append-only' -and $md -notmatch '\*\*FAILED\*\*' -and $md -notmatch '- not run')) C12-33 audit log stays append-only after restore",
    "$(PF ($md -match 'Checksum check: PASS' -and $md -match 'age decryption: PASS')) C12-34 a tampered backup is refused (checksum and age)"
  ) | Set-Content -Encoding utf8 "$results\db-restore.txt"
}

Write-Host '== 5. Report'
& $Python (Join-Path $root 'scripts\testing\make_component_report.py')
