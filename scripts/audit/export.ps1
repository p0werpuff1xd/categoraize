<#
.SYNOPSIS
  Exports the append-only audit log (CategorizeAuditEvent) to a dated JSON
  file for the weekly review and for safekeeping outside the database.

.DESCRIPTION
  Read-only. Rows hold IDs, event types and flags only (never email content,
  tokens or IP addresses), so the export can be stored with the backups.

.EXAMPLE
  .\scripts\audit\export.ps1 -Days 7 -OutDir E:\backups\audit-exports
#>
param(
  [int]$Days = 7,
  [string]$OutDir = 'E:\backups\audit-exports',
  [string]$Container = 'inbox-zero-services-db-1',
  [string]$Database = 'inboxzero'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $OutDir "audit-events-$stamp.json"

$sql = @"
select coalesce(json_agg(e order by e."createdAt"), '[]'::json)
from (
  select id, "createdAt", "eventType", "userId", "emailAccountId", metadata
  from "CategorizeAuditEvent"
  where "createdAt" >= now() - interval '$Days days'
) e;
"@
$json = $sql | & docker exec -i $Container psql -U postgres -d $Database -At -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "psql failed: $json" }

[IO.File]::WriteAllText($outFile, ($json -join "`n"), (New-Object Text.UTF8Encoding $false))
Set-ItemProperty -LiteralPath $outFile -Name IsReadOnly -Value $true
$count = (($json -join '') | ConvertFrom-Json).Count
Write-Host "Exported $count event(s) from the last $Days day(s) to $outFile"
