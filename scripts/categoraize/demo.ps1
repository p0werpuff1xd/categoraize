<#
.SYNOPSIS
  Runs the five acceptance scenarios against the running NLP service and
  prints PASS/FAIL for each. Start the service first (start.ps1 -SkipWeb).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\categoraize\demo.ps1
#>
param([string]$Url = "http://127.0.0.1:8000")

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$python = Join-Path $root "fastapi_core\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "fastapi_core\.venv is missing. Create it first (README, 'NLP service')." }

$env:PYTHONIOENCODING = "utf-8"
& $python (Join-Path $root "fastapi_core\scripts\demo_scenarios.py") --url $Url
exit $LASTEXITCODE
