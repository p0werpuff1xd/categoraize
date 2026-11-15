<#
.SYNOPSIS
  Starts everything CategorAIze needs on Windows: Postgres (pgvector) and Redis
  in Docker, the FastAPI NLP service on port 8000, and the web app on port 3000.

.DESCRIPTION
  Run from any folder:  powershell -ExecutionPolicy Bypass -File scripts\categoraize\start.ps1
  Pieces that are already running are left alone. Logs go to %TEMP%\categoraize.
  The internal key is read from apps\web\.env and never printed.

.PARAMETER SkipWeb
  Start only Docker and the NLP service (enough for scripts\categoraize\demo.ps1).
#>
param([switch]$SkipWeb)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$envFile = Join-Path $root "apps\web\.env"
$logDir = Join-Path $env:TEMP "categoraize"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Optional machine-specific setup (tool paths, caches) kept next to the repo.
$devEnv = Join-Path (Split-Path $root -Parent) "dev-env.ps1"
if (Test-Path $devEnv) { . $devEnv }

function Test-Url([string]$url) {
  try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 10).StatusCode -lt 500 } catch { $false }
}

# A port that is already listening means that piece is running (a dev server
# can take longer than any HTTP timeout to answer while it compiles).
function Test-Port([int]$port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Url([string]$url, [string]$name, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Url $url) { Write-Host "  $name is ready" -ForegroundColor Green; return }
    Start-Sleep -Seconds 3
  }
  throw "$name did not become ready within $seconds s. See the logs in $logDir."
}

if (-not (Test-Path $envFile)) {
  throw "apps\web\.env is missing. Copy apps\web\.env.example to apps\web\.env and fill it in (see README)."
}
$keyLine = Select-String -Path $envFile -Pattern '^CATEGORAIZE_INTERNAL_KEY=' | Select-Object -First 1
$key = if ($keyLine) { ($keyLine.Line -replace '^CATEGORAIZE_INTERNAL_KEY=', '').Trim().Trim('"', "'") } else { "" }
if (-not $key) { throw "Set CATEGORAIZE_INTERNAL_KEY in apps\web\.env (any long random string)." }

Write-Host "1/3 Docker: Postgres + Redis"
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker is not running. Start Docker Desktop and try again." }
Push-Location $root
# Name the services: the compose file also defines the upstream web image and a
# cron container without a profile, which must not start here.
$ErrorActionPreference = "Continue"  # docker writes progress to stderr
try {
  docker compose --profile local-db --profile local-redis up -d --no-recreate db redis serverless-redis-http 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker compose failed. Run it by hand to see why: docker compose --profile local-db --profile local-redis up -d db redis serverless-redis-http" }
} finally { Pop-Location; $ErrorActionPreference = "Stop" }
$deadline = (Get-Date).AddSeconds(90)
while ((docker inspect -f '{{.State.Health.Status}}' inbox-zero-services-db-1 2>$null) -ne "healthy") {
  if ((Get-Date) -gt $deadline) { throw "Postgres did not become healthy. Run: docker compose logs db" }
  Start-Sleep -Seconds 2
}
Write-Host "  Postgres and Redis are up" -ForegroundColor Green

Write-Host "2/3 NLP service (http://127.0.0.1:8000)"
if (Test-Port 8000) {
  Write-Host "  already running"
} else {
  $python = Join-Path $root "fastapi_core\.venv\Scripts\python.exe"
  if (-not (Test-Path $python)) { throw "fastapi_core\.venv is missing. Create it first (README, 'NLP service')." }
  $env:CATEGORAIZE_INTERNAL_KEY = $key
  Start-Process -FilePath $python -WorkingDirectory (Join-Path $root "fastapi_core") -WindowStyle Hidden `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -RedirectStandardOutput (Join-Path $logDir "nlp.out.log") -RedirectStandardError (Join-Path $logDir "nlp.log")
  Write-Host "  loading the Sentence-BERT model and the tagger (10-60 s; the first run downloads ~470 MB)"
}
$deadline = (Get-Date).AddSeconds(240)
while ($true) {
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:8000/healthz" -TimeoutSec 3
    if ($health.status -eq "ready") { Write-Host "  ready: tagger $($health.tagger.name) $($health.tagger.version)" -ForegroundColor Green; break }
  } catch { }
  if ((Get-Date) -gt $deadline) { throw "The NLP service did not become ready. See $logDir\nlp.log" }
  Start-Sleep -Seconds 3
}

if ($SkipWeb) {
  Write-Host "`nSkipped the web app. Run the scenarios with: scripts\categoraize\demo.ps1"
  exit 0
}

Write-Host "3/3 Web app (http://localhost:3000)"
$pnpm = (Get-Command pnpm.cmd -ErrorAction SilentlyContinue).Source
if (-not $pnpm) { throw "pnpm is not on PATH. Install Node 24 and run: corepack enable" }
Push-Location (Join-Path $root "apps\web")
$ErrorActionPreference = "Continue"  # prisma prints its banner on stderr
try {
  & $pnpm exec prisma migrate deploy 2>&1 | Out-File (Join-Path $logDir "migrate.log") -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw "Database migrations failed. See $logDir\migrate.log" }
  Write-Host "  database migrations are up to date"
} finally { Pop-Location; $ErrorActionPreference = "Stop" }
if (Test-Port 3000) {
  Write-Host "  already running"
} else {
  Start-Process -FilePath $pnpm -WorkingDirectory $root -WindowStyle Hidden `
    -ArgumentList "--filter", "inbox-zero-ai", "dev" `
    -RedirectStandardOutput (Join-Path $logDir "web.log") -RedirectStandardError (Join-Path $logDir "web.err.log")
  Write-Host "  starting Next.js (the first page compiles in about a minute)"
}
Wait-Url "http://localhost:3000" "Web app" 300

Write-Host "`nCategorAIze is running." -ForegroundColor Green
Write-Host "  App:        http://localhost:3000"
Write-Host "  Service:    http://127.0.0.1:8000/healthz"
Write-Host "  Logs:       $logDir"
Write-Host "  Scenarios:  scripts\categoraize\demo.ps1"
