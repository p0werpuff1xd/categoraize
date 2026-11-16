<#
.SYNOPSIS
  Encrypted, redacted backup of the CategorAIze data in the LOCAL dev Postgres
  (IAS Phase 7 A, 3-2-1 rule: live DB + Copy 1 + Copy 2 on separate media).

.DESCRIPTION
  1. Checks Docker, the live container, and that the pg_dump image's major
     version is >= the server's.
  2. Starts a throw-away STAGING Postgres (pgvector image) that shares the live
     container's network namespace, so it reaches the live DB on 127.0.0.1
     (trust auth inside that namespace: no password is needed or handled).
     The staging server listens on 127.0.0.1:55432 only and is removed after.
  3. Copies the full schema (DDL only) into staging, then copies ROWS only for
     the CategorAIze and settings tables listed in common.ps1. Email content
     (bodies, snippets, subjects, summaries, span text) and OAuth tokens /
     secrets are replaced with NULL or '' inside the SELECT, so they never
     leave the live database. A guard query re-checks this before dumping.
  4. pg_dump (custom format) from staging, encrypts it with age (X25519 public
     key: the backup machine never needs the private key), writes a SHA-256
     checksum file and a manifest with row counts.
  5. Copies the set to Copy 1 and Copy 2 under a dated name (never
     overwritten), verifies each copy, marks it read-only, applies retention
     (7 daily + 4 weekly; only older files are removed, each one logged),
     logs every step without secrets and appends a backup_run audit event.

  The live database is only READ (pg_dump --schema-only and COPY ... TO STDOUT),
  apart from the single audit-event INSERT at the end. Never point this script
  at Supabase (production): it only accepts a local Docker container.

.PARAMETER Copy1
  First backup copy. Default E:\backups\copy1 is a placeholder on the same disk:
  point it at the EXTERNAL DRIVE (for example F:\categoraize-backups).
.PARAMETER Copy2
  Second backup copy. Default E:\backups\copy2 is a placeholder: point it at the
  OFF-SITE CLOUD SYNC FOLDER (for example the Google Drive or OneDrive folder).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup\backup.ps1 `
    -Copy1 F:\categoraize-backups -Copy2 "$env:USERPROFILE\OneDrive\categoraize-backups"
#>
[CmdletBinding()]
param(
  [string]$Copy1 = 'E:\backups\copy1',
  [string]$Copy2 = 'E:\backups\copy2',
  [string]$LogDir = 'E:\backups\logs',
  [string]$WorkDir = 'E:\tmp\categoraize-backup-work',
  [string]$RecipientFile = 'E:\keys\categoraize-backup\age-recipient.txt',
  [string]$AgeExe = 'E:\tools\age\age.exe',
  [string]$LiveContainer = 'inbox-zero-services-db-1',
  [string]$Database = 'inboxzero',
  [string]$PgImage = 'pgvector/pgvector:pg16',
  [int]$StagingPort = 55432,
  [int]$KeepDaily = 7,
  [int]$KeepWeekly = 4
)

$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'common.ps1')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$base = "categoraize-$stamp"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logFile = Join-Path $LogDir ("backup-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
$timings = New-Object System.Collections.Specialized.OrderedDictionary
$staging = "categoraize-backup-staging-$stamp"
$stagingStarted = $false
$status = 'FAIL'
$errorText = $null
$manifest = $null
$total = [Diagnostics.Stopwatch]::StartNew()


try {
  Write-Log "=== CategorAIze backup $base ===" $logFile
  foreach ($dest in $Copy1, $Copy2) {
    if ($dest.StartsWith('E:\backups', [StringComparison]::OrdinalIgnoreCase)) {
      Write-Log "WARNING $dest is the default placeholder on the same disk as the live data. Point -Copy1 at the external drive and -Copy2 at the off-site cloud folder for a real 3-2-1 backup." $logFile
    }
  }
  if ((Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force $Copy1)).Path -eq (Resolve-Path -LiteralPath (New-Item -ItemType Directory -Force $Copy2)).Path) {
    throw 'Copy1 and Copy2 must be different folders (3-2-1 rule).'
  }
  foreach ($f in $AgeExe, $RecipientFile) { if (-not (Test-Path -LiteralPath $f)) { throw "Missing $f (see docs/ias/key-management.md)" } }
  # [string] drops the PSPath/provider note properties Get-Content attaches.
  $recipient = [string](Get-Content -LiteralPath $RecipientFile | Where-Object { $_ -match '^age1' } | Select-Object -First 1)
  if (-not $recipient) { throw "No age1... public key in $RecipientFile" }

  Measure-Step 'preflight' {
    $running = @(Invoke-Tool docker @('inspect', '-f', '{{.State.Running}}', $LiveContainer))
    if ($running[-1] -ne 'true') { throw "$LiveContainer is not running" }
    $script:serverVersion = @(Invoke-Tool docker @('exec', $LiveContainer, 'psql', '-U', 'postgres', '-d', $Database, '-Atc', 'show server_version'))[-1]
    $script:clientVersion = @(Invoke-Tool docker @('run', '--rm', $PgImage, 'pg_dump', '--version'))[-1]
    if ((Get-PgMajor $clientVersion) -lt (Get-PgMajor $serverVersion)) {
      throw "pg_dump in $PgImage ($clientVersion) is older than the server ($serverVersion)"
    }
    Write-Log "server $serverVersion; client $clientVersion" $logFile
  } $timings $logFile

  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Join-Path $WorkDir 'sql') | Out-Null

  Measure-Step 'generate-copy-sql' {
    $inList = ($BackupDataTables | ForEach-Object { ConvertTo-SqlLiteral $_ }) -join ','
    $colSql = "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name in ($inList) order by table_name, ordinal_position;"
    $rows = Invoke-Tool docker @('exec', '-i', $LiveContainer, 'psql', '-U', 'postgres', '-d', $Database, '-At', '-F', '|', '-X') -StdIn $colSql
    $columns = @{}
    foreach ($r in $rows) {
      $p = $r.Split('|'); if ($p.Count -lt 4) { continue }
      if (-not $columns.ContainsKey($p[0])) { $columns[$p[0]] = New-Object System.Collections.ArrayList }
      [void]$columns[$p[0]].Add([pscustomobject]@{ Name = $p[1]; Type = $p[2]; Nullable = ($p[3] -eq 'YES') })
    }
    $missing = @($BackupDataTables | Where-Object { -not $columns.ContainsKey($_) })
    if ($missing.Count) { throw "Tables not found in the live DB: $($missing -join ', ')" }

    $script:redacted = New-Object System.Collections.ArrayList
    $sh = New-Object System.Text.StringBuilder
    [void]$sh.AppendLine('#!/bin/bash')
    [void]$sh.AppendLine('set -euo pipefail')
    [void]$sh.AppendLine("LIVE='psql -h 127.0.0.1 -p 5432 -U postgres -d $Database -v ON_ERROR_STOP=1 -q -X'")
    [void]$sh.AppendLine("STAGE='psql -p $StagingPort -U postgres -d $Database -v ON_ERROR_STOP=1 -q -X'")
    [void]$sh.AppendLine("pg_dump -h 127.0.0.1 -p 5432 -U postgres -d $Database --schema-only -Fc -f /work/schema.dump")
    [void]$sh.AppendLine("pg_restore -p $StagingPort -U postgres -d $Database --no-owner --exit-on-error /work/schema.dump")
    $i = 0
    foreach ($table in $BackupDataTables) {
      $i++
      $select = @(); $names = @()
      foreach ($c in $columns[$table]) {
        $q = '"' + $c.Name + '"'
        $names += $q
        $expr = $null
        if ($BackupRedactions.ContainsKey($table) -and $BackupRedactions[$table].ContainsKey($c.Name)) {
          $expr = $BackupRedactions[$table][$c.Name]
        } elseif ($c.Type -in 'text', 'character varying' -and $c.Name -match $SecretColumnPattern) {
          $expr = if ($c.Nullable) { 'NULL' } else { "''" }
        }
        if ($expr) {
          $select += "$expr AS $q"
          [void]$redacted.Add([pscustomobject]@{ Table = $table; Column = $c.Name; With = $expr })
        } else {
          $select += $q
        }
      }
      $out = "\copy (SELECT $($select -join ', ') FROM public.""$table"") to pstdout"
      $in = "SET session_replication_role = replica;`n\copy public.""$table"" ($($names -join ', ')) from pstdin"
      Write-Utf8NoBom (Join-Path $WorkDir "sql\$i-out.sql") ($out + "`n")
      Write-Utf8NoBom (Join-Path $WorkDir "sql\$i-in.sql") ($in + "`n")
      [void]$sh.AppendLine("`$LIVE -f /work/sql/$i-out.sql | `$STAGE -f /work/sql/$i-in.sql")
    }
    Write-Utf8NoBom (Join-Path $WorkDir 'stage.sh') ($sh.ToString().Replace("`r`n", "`n"))
    Write-Log ("{0} tables with rows, {1} columns redacted" -f $BackupDataTables.Count, $redacted.Count) $logFile
  } $timings $logFile

  Measure-Step 'start-staging' {
    Invoke-Tool docker @('run', '-d', '--rm', '--name', $staging,
      '--network', "container:$LiveContainer",
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', "POSTGRES_DB=$Database", '-e', "PGPORT=$StagingPort",
      '-v', "${WorkDir}:/work",
      $PgImage, 'postgres', '-c', "port=$StagingPort", '-c', 'listen_addresses=127.0.0.1') | Out-Null
    $script:stagingStarted = $true
    Wait-PostgresReady -Container $staging -Port $StagingPort
  } $timings $logFile

  Measure-Step 'copy-schema-and-redacted-rows' {
    Invoke-Tool docker @('exec', $staging, 'bash', '/work/stage.sh') | Out-Null
  } $timings $logFile

  Measure-Step 'verify-redaction-and-count' {
    $checks = foreach ($r in $redacted) {
      "select '$($r.Table).$($r.Column)', count(*) from public.""$($r.Table)"" where ""$($r.Column)"" is not null and ""$($r.Column)""::text <> '';"
    }
    $bad = @(Invoke-Tool docker @('exec', '-i', $staging, 'psql', '-p', "$StagingPort", '-U', 'postgres', '-d', $Database, '-At', '-F', '|', '-X') -StdIn ($checks -join "`n") |
        Where-Object { $_ -match '\|' -and $_.Split('|')[1] -ne '0' })
    if ($bad.Count) { throw "Redaction check failed: $($bad -join ', ')" }

    $countSql = ($BackupDataTables | ForEach-Object { "select '$_', count(*) from public.""$_"";" }) -join "`n"
    $script:counts = [ordered]@{}
    foreach ($line in Invoke-Tool docker @('exec', '-i', $staging, 'psql', '-p', "$StagingPort", '-U', 'postgres', '-d', $Database, '-At', '-F', '|', '-X') -StdIn $countSql) {
      $p = $line.Split('|'); if ($p.Count -eq 2) { $counts[$p[0]] = [int64]$p[1] }
    }
    $script:migration = @(Invoke-Tool docker @('exec', '-i', $LiveContainer, 'psql', '-U', 'postgres', '-d', $Database, '-At', '-X') -StdIn 'select migration_name from "_prisma_migrations" where finished_at is not null order by migration_name desc limit 1;')[-1]
    Write-Log ("redaction verified on {0} columns; {1} rows in {2} tables" -f $redacted.Count, ($counts.Values | Measure-Object -Sum).Sum, $counts.Count) $logFile
  } $timings $logFile

  $dumpName = "$base.dump"
  $dumpPath = Join-Path $WorkDir $dumpName
  Measure-Step 'pg_dump' {
    Invoke-Tool docker @('exec', $staging, 'pg_dump', '-p', "$StagingPort", '-U', 'postgres', '-d', $Database, '-Fc', '-Z', '6', '-f', "/work/$dumpName") | Out-Null
  } $timings $logFile

  Measure-Step 'stop-staging' {
    Invoke-Tool docker @('stop', $staging) | Out-Null
    $script:stagingStarted = $false
  } $timings $logFile

  $agePath = "$dumpPath.age"
  Measure-Step 'encrypt' {
    Invoke-Tool $AgeExe @('-R', $RecipientFile, '-o', $agePath, $dumpPath) | Out-Null
    Remove-Item -LiteralPath $dumpPath -Force   # the plaintext (redacted) dump never leaves the work dir
  } $timings $logFile

  Measure-Step 'checksum-and-manifest' {
    $script:manifest = [ordered]@{
      name = $base
      createdAt = (Get-Date).ToString('o')
      source = "local Docker container $LiveContainer / $Database (never Supabase)"
      serverVersion = $serverVersion
      pgDumpVersion = $clientVersion
      format = 'pg_dump custom (-Fc), encrypted with age (X25519)'
      ageRecipient = $recipient
      latestMigration = $migration
      dataTables = @($BackupDataTables)
      schemaOnly = 'all other public tables (DDL only, no rows)'
      redactedColumns = @($redacted | ForEach-Object { "$($_.Table).$($_.Column)" })
      rowCounts = $counts
      encryptedBytes = (Get-Item -LiteralPath $agePath).Length
      sha256 = (Get-FileSha256 $agePath)
    }
    Write-Utf8NoBom (Join-Path $WorkDir "$base.manifest.json") ($manifest | ConvertTo-Json -Depth 5)
    $sums = @(
      "{0}  {1}" -f (Get-FileSha256 $agePath), "$base.dump.age"
      "{0}  {1}" -f (Get-FileSha256 (Join-Path $WorkDir "$base.manifest.json")), "$base.manifest.json"
    )
    Write-Utf8NoBom (Join-Path $WorkDir "$base.sha256") (($sums -join "`n") + "`n")
  } $timings $logFile

  Measure-Step 'copy-verify-readonly' {
    foreach ($dest in $Copy1, $Copy2) {
      foreach ($suffix in '.dump.age', '.manifest.json', '.sha256') {
        $target = Join-Path $dest ($base + $suffix)
        if (Test-Path -LiteralPath $target) { throw "$target already exists; backups are never overwritten" }
        Copy-Item -LiteralPath (Join-Path $WorkDir ($base + $suffix)) -Destination $target
      }
      $verify = Test-ChecksumFile (Join-Path $dest "$base.sha256")
      if (@($verify | Where-Object { -not $_.Ok }).Count) { throw "Checksum mismatch after copying to $dest" }
      foreach ($suffix in '.dump.age', '.manifest.json', '.sha256') { (Get-Item -LiteralPath (Join-Path $dest ($base + $suffix))).IsReadOnly = $true }
      Write-Log "COPY  $dest\$base.* verified and read-only" $logFile
    }
  } $timings $logFile

  Measure-Step 'retention' {
    foreach ($dest in $Copy1, $Copy2) { Invoke-Retention -Folder $dest -KeepDaily $KeepDaily -KeepWeekly $KeepWeekly -LogFile $logFile }
  } $timings $logFile

  $status = 'PASS'
} catch {
  $errorText = $_.Exception.Message
  Write-Log "ERROR $errorText" $logFile
} finally {
  if ($stagingStarted) { & docker stop $staging 2>$null | Out-Null }
  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }
  $total.Stop()
  $timings['total'] = [math]::Round($total.Elapsed.TotalSeconds, 2)
  try {
    $meta = @{ status = $status; name = $base; seconds = $timings['total']; copies = 2 }
    if ($manifest) { $meta['encryptedBytes'] = $manifest.encryptedBytes; $meta['tables'] = $manifest.rowCounts.Count }
    if ($errorText) { $meta['error'] = $errorText.Substring(0, [Math]::Min(180, $errorText.Length)) }
    $auditId = Add-AuditEvent -Container $LiveContainer -Database $Database -EventType 'backup_run' -Metadata $meta
    Write-Log "AUDIT backup_run recorded ($auditId)" $logFile
  } catch {
    Write-Log "WARNING could not record the backup_run audit event: $($_.Exception.Message)" $logFile
  }
  Write-Log ("TIMINGS " + (($timings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)s" }) -join ', ')) $logFile
  Write-Log "=== backup $status ===" $logFile
}

if ($status -ne 'PASS') { exit 1 }
