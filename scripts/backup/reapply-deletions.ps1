<#
.SYNOPSIS
  Re-applies account erasures after a restore (RA 10173; recovery runbook step 7).

.DESCRIPTION
  A restored backup can bring back users who deleted their account after the
  backup was taken. This script deletes them again from the RESTORED database.

  Where the user IDs come from (pick one):
    -UserIds a,b,c          IDs you collected yourself.
    -SourceContainer <name> The old (pre-incident) database, if it can still be
                            read: every data_deletion_completed event since
                            -Since (the backup time) in its audit log.

  The restored copy's own audit log cannot know about deletions made after its
  backup, which is why the IDs come from outside it.

  Deleting a User row cascades to its email accounts and all CategorAIze rows.
  Audit events are kept (append-only, IDs only). Run with -DryRun first.

.EXAMPLE
  .\reapply-deletions.ps1 -TargetContainer categoraize-restore-test-20261117 -SourceContainer inbox-zero-services-db-old -Since '2026-11-16T23:49:00+08:00' -DryRun
#>
param(
  [Parameter(Mandatory = $true)][string]$TargetContainer,
  [string[]]$UserIds = @(),
  [string]$SourceContainer = '',
  [string]$Since = '',
  [string]$Database = 'inboxzero',
  [string]$LiveContainer = 'inbox-zero-services-db-1',
  # Only for a real recovery, after the restore has replaced the live database.
  [switch]$AllowLiveTarget,
  [switch]$DryRun,
  [string]$LogDir = 'E:\backups\logs'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logFile = Join-Path $LogDir ("reapply-deletions-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

if ($TargetContainer -eq $LiveContainer -and -not $AllowLiveTarget) {
  throw "Refusing to delete from the live database ($LiveContainer). Restore first, or pass -AllowLiveTarget during a real recovery."
}

function Invoke-Psql([string]$Container, [string]$Sql) {
  $out = $Sql | & docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -At -q 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql failed on ${Container}: $out" }
  return @($out | Where-Object { $_ -ne '' })
}

if ($SourceContainer) {
  if (-not $Since) { throw '-Since (the backup time, ISO 8601 with offset) is required with -SourceContainer.' }
  $sinceSql = ConvertTo-SqlLiteral ([DateTimeOffset]::Parse($Since).UtcDateTime.ToString('yyyy-MM-dd HH:mm:ss'))
  $fromSource = Invoke-Psql $SourceContainer "select distinct ""userId"" from ""CategorizeAuditEvent"" where ""eventType"" = 'data_deletion_completed' and ""userId"" is not null and ""createdAt"" >= $sinceSql;"
  $UserIds = @($UserIds + $fromSource)
}
$UserIds = @($UserIds | Where-Object { $_ -match '^[A-Za-z0-9_-]{1,64}$' } | Sort-Object -Unique)
Write-Log "Target $TargetContainer; $($UserIds.Count) user ID(s) to erase; dry run: $([bool]$DryRun)" $logFile
if (-not $UserIds.Count) { Write-Log 'Nothing to do.' $logFile; return }

$idList = ($UserIds | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ','
$countSql = @"
select 'User', count(*) from "User" where id in ($idList)
union all select 'EmailAccount', count(*) from "EmailAccount" where "userId" in ($idList)
union all select 'CategorizeClassification', count(*) from "CategorizeClassification" c join "EmailAccount" e on e.id = c."emailAccountId" where e."userId" in ($idList)
union all select 'CategorizeCategory', count(*) from "CategorizeCategory" c join "EmailAccount" e on e.id = c."emailAccountId" where e."userId" in ($idList)
union all select 'CategorizeUserConsent', count(*) from "CategorizeUserConsent" where "userId" in ($idList);
"@

$before = Invoke-Psql $TargetContainer $countSql
Write-Log ("Before: " + ($before -join '; ')) $logFile
if ($DryRun) { Write-Log 'Dry run: nothing deleted.' $logFile; return }

Invoke-Psql $TargetContainer "begin; delete from ""User"" where id in ($idList); commit;" | Out-Null
$after = Invoke-Psql $TargetContainer $countSql
Write-Log ("After:  " + ($after -join '; ')) $logFile
$left = ($after | ForEach-Object { [int]($_ -split '\|')[1] } | Measure-Object -Sum).Sum
if ($left -ne 0) { throw "Rows remain after deletion: $($after -join '; ')" }
Write-Log 'PASS: all rows for these users are gone from the target.' $logFile
