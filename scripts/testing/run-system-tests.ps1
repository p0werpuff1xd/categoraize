<#
.SYNOPSIS
  Runs the Prompt B system tests against the deployed stack and rebuilds
  docs/testing/system_tests.md.

.DESCRIPTION
  1. API suite (pytest/httpx): fastapi_core/system_tests -> results/api.xml
  2. Playwright suite (pnpm test:e2e) -> results/playwright.xml, artifacts/playwright/
  3. Read-only production DB checks (scripts/testing/prod-db-checks.sql via docker psql,
     inside a READ ONLY transaction) -> results/prod-db-checks.txt
  Optional (long or costly): -WithLoad (locust 50 users x 5 min), -WithAudit
  (gitleaks, pip-audit, pnpm audit), -WithLighthouse, -WithBackup (3-2-1 backup and
  restore from Copy 2).
  4. scripts/testing/make_system_report.py

  Secrets (the NLP key, DIRECT_URL) are read from E:\categoraize\secrets into
  process memory only; they are never printed or written to a result file.
#>
[CmdletBinding()]
param(
  [string]$Python = 'E:\categoraize\categoraize\fastapi_core\.venv\Scripts\python.exe',
  [string]$Fnm = 'C:\Users\Lauren\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe\fnm.exe',
  [string]$Secrets = 'E:\categoraize\secrets',
  [string]$NlpUrl = 'https://categoraize-nlp-35rdktlybq-as.a.run.app',
  [string]$WebUrl = 'https://categoraize-35rdktlybq-eu.a.run.app',
  [switch]$WithLoad, [switch]$WithAudit, [switch]$WithLighthouse, [switch]$WithBackup
)
$ErrorActionPreference = 'Continue'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$res = Join-Path $root 'docs\testing\system\results'
$art = Join-Path $root 'docs\testing\system\artifacts'
New-Item -ItemType Directory -Force -Path $res, $art | Out-Null
$env:SYSTEM_NLP_URL = $NlpUrl; $env:SYSTEM_WEB_URL = $WebUrl
$env:SYSTEM_NLP_KEY = (Get-Content (Join-Path $Secrets 'categoraize-internal-key.txt') -Raw).Trim()
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'

Write-Host '== 1. API suite'
Push-Location (Join-Path $root 'fastapi_core')
& $Python -m pytest system_tests -q -p no:cacheprovider -W ignore -o addopts="" -o junit_family=xunit1 --junitxml="$res\api.xml"
if ($WithLoad) {
  & $Python -m locust -f system_tests/load/locustfile.py --headless -u 50 -r 10 -t 5m --host $NlpUrl `
    --csv "$res\load" --html "$art\load-report.html" --only-summary
}
Pop-Location

Write-Host '== 2. Playwright suite'
Push-Location (Join-Path $root 'apps\web')
& $Fnm exec --using=24 -- node node_modules\@playwright\test\cli.js test -c playwright.system.config.mjs
Pop-Location

Write-Host '== 3. Production DB checks (read-only)'
$line = Get-Content (Join-Path $Secrets 'supabase-prod.env') | Where-Object { $_ -match '^DIRECT_URL=' } | Select-Object -First 1
$url = ($line -replace '^DIRECT_URL=', '').Trim('"', "'") -replace '([?&])uselibpqcompat=true&?', '$1' -replace '[?&]$', ''
Get-Content (Join-Path $root 'scripts\testing\prod-db-checks.sql') -Raw |
  docker run --rm -i -e "PGURL=$url" pgvector/pgvector:pg16 sh -c 'psql "$PGURL" -X -q' 2>&1 |
  ForEach-Object { "$_" } | Set-Content -Encoding utf8 "$res\prod-db-checks.txt"
Remove-Variable url, line

if ($WithAudit) {
  Write-Host '== Audits'
  $gl = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter gitleaks.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
  & $gl git $root --redact --no-banner --report-format json --report-path "$res\gitleaks.json"
  & $Python -m pip_audit -r (Join-Path $root 'fastapi_core\requirements.txt') --format json -o "$res\pip-audit.json"
  $nodeDir = Split-Path (& $Fnm exec --using=24 -- node -p "process.execPath")
  Push-Location $root
  & $Fnm exec --using=24 -- node (Join-Path $nodeDir 'node_modules\npm\bin\npx-cli.js') -y pnpm@12.18.0 audit --json 2>$null |
    Out-File -Encoding utf8 "$res\pnpm-audit.json"
  Pop-Location
}

if ($WithLighthouse) {
  $env:CHROME_PATH = (Get-ChildItem "$env:LOCALAPPDATA\ms-playwright" -Recurse -Filter chrome.exe | Where-Object { $_.FullName -notmatch 'headless' } | Select-Object -First 1).FullName
  $nodeDir = Split-Path (& $Fnm exec --using=24 -- node -p "process.execPath")
  foreach ($p in 'login', 'privacy') {
    & $Fnm exec --using=24 -- node (Join-Path $nodeDir 'node_modules\npm\bin\npx-cli.js') -y lighthouse@12.8.2 "$WebUrl/$p" `
      --only-categories=accessibility,best-practices,performance,seo --output=json --output=html `
      --output-path="$art\lighthouse-$p" --chrome-flags="--headless=new" --quiet
  }
}

if ($WithBackup) {
  Write-Host '== Backup and restore'
  $task = (Get-ScheduledTask -TaskName 'CategorAIze daily backup').Actions[0]
  $copy2 = [regex]::Match($task.Arguments, '-Copy2\s+(\S+)').Groups[1].Value
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& $($task.Execute) $($task.Arguments)" | Out-Null
  $set = (Get-ChildItem $copy2 -Filter *.manifest.json | Sort-Object LastWriteTime | Select-Object -Last 1).BaseName -replace '\.manifest$', ''
  $log = Get-ChildItem 'E:\backups\logs' -Filter 'backup-*.log' | Sort-Object LastWriteTime | Select-Object -Last 1
  Get-Content $log.FullName | Select-Object -Last 40 | Set-Content -Encoding utf8 "$res\s12-backup-log.txt"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\backup\restore-test.ps1') -BackupDir $copy2 -BackupName $set -ReportPath "$res\s12-restore-report.md"
}

$env:SYSTEM_NLP_KEY = $null
Write-Host '== 4. Report'
& $Python (Join-Path $root 'scripts\testing\make_system_report.py')
