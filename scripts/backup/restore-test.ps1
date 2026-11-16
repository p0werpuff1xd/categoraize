<#
.SYNOPSIS
  Proves a CategorAIze backup can be restored (IAS Phase 7 A, control A2/I4).

.DESCRIPTION
  1. Verifies the SHA-256 checksums of the newest (or the named) backup set and
     refuses to continue on any mismatch.
  2. Decrypts it with the age identity (private key) into a temp work folder.
  3. Starts a NEW SCRATCH Postgres container (pgvector image) on another port
     (127.0.0.1:15433 by default, random password, removed afterwards) and
     restores into it with pg_restore. The live database is never written to,
     except for one restore_test row appended to its audit log at the end.
  4. Compares the restored row counts with the manifest and re-checks that the
     redacted email-content and secret columns are empty. On the scratch copy
     it also checks the audit log is still append-only (UPDATE, DELETE and
     TRUNCATE rejected).
  5. Tamper test: flips one byte in a copy of the encrypted file and checks the
     restore refuses it (checksum mismatch), then also rewrites the checksum
     file to match and checks age still refuses it (authenticated encryption).
  6. Times every step and writes docs/backup-report.md with PASS/FAIL.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\backup\restore-test.ps1 -BackupDir F:\categoraize-backups
#>
[CmdletBinding()]
param(
  [string]$BackupDir = 'E:\backups\copy1',
  [string]$BackupName = '',
  [string]$IdentityFile = 'E:\keys\categoraize-backup\age-identity.txt',
  [string]$AgeExe = 'E:\tools\age\age.exe',
  [string]$PgImage = 'pgvector/pgvector:pg16',
  [int]$ScratchPort = 15433,
  [string]$LiveContainer = 'inbox-zero-services-db-1',
  [string]$Database = 'inboxzero',
  [string]$WorkDir = 'E:\tmp\categoraize-restore-work',
  [string]$LogDir = 'E:\backups\logs',
  [string]$ReportPath = ''
)

$ErrorActionPreference = 'Continue'
# $PSScriptRoot is empty inside param defaults on Windows PowerShell 5.1.
if (-not $ReportPath) { $ReportPath = Join-Path $PSScriptRoot '..\..\docs\backup-report.md' }
. (Join-Path $PSScriptRoot 'common.ps1')

if ($ScratchPort -eq 5432) { throw 'The scratch port must differ from the live database port (5432).' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$logFile = Join-Path $LogDir ("restore-test-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
$scratch = "categoraize-restore-test-$stamp"
$scratchStarted = $false
$timings = New-Object System.Collections.Specialized.OrderedDictionary
$status = 'FAIL'
$errorText = $null
$countRows = @()
$redactionOk = $false
$appendOnly = [ordered]@{}
$tamper = [ordered]@{ checksum = 'not run'; age = 'not run' }
$base = $null
$manifest = $null

# Checksum first, then decrypt. Throws (refuses) on any mismatch or decryption error.
function Invoke-VerifiedDecrypt {
  param([string]$Dir, [string]$Base, [string]$OutFile)
  $sumFile = Join-Path $Dir "$Base.sha256"
  if (-not (Test-Path -LiteralPath $sumFile)) { throw "REFUSED: no checksum file for $Base" }
  $bad = @(Test-ChecksumFile $sumFile | Where-Object { -not $_.Ok })
  if ($bad.Count) { throw "REFUSED: checksum mismatch for $($bad.File -join ', ')" }
  $listed = @(Get-Content -LiteralPath $sumFile | Where-Object { $_ -match "\s\*?$([regex]::Escape("$Base.dump.age"))$" })
  if ($listed.Count -ne 1) { throw "REFUSED: $Base.dump.age is not covered by the checksum file" }
  try {
    Invoke-Tool $AgeExe @('-d', '-i', $IdentityFile, '-o', $OutFile, (Join-Path $Dir "$Base.dump.age")) | Out-Null
  } catch {
    if (Test-Path -LiteralPath $OutFile) { Remove-Item -LiteralPath $OutFile -Force }
    throw "REFUSED: age could not decrypt/authenticate $Base.dump.age"
  }
}

$total = [Diagnostics.Stopwatch]::StartNew()
try {
  Write-Log '=== CategorAIze restore test ===' $logFile
  if (-not (Test-Path -LiteralPath $IdentityFile)) { throw "Missing age identity $IdentityFile (see docs/ias/key-management.md)" }
  if (-not $BackupName) {
    $latest = Get-ChildItem -LiteralPath $BackupDir -Filter 'categoraize-*.dump.age' | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $latest) { throw "No backups in $BackupDir" }
    $BackupName = $latest.Name -replace '\.dump\.age$', ''
  }
  $base = $BackupName
  Write-Log "backup set $BackupDir\$base" $logFile
  $manifest = Get-Content -LiteralPath (Join-Path $BackupDir "$base.manifest.json") -Raw | ConvertFrom-Json

  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  $dumpPath = Join-Path $WorkDir "$base.dump"

  Measure-Step 'verify-checksum-and-decrypt' {
    Invoke-VerifiedDecrypt -Dir $BackupDir -Base $base -OutFile $dumpPath
  } $timings $logFile

  Measure-Step 'start-scratch-db' {
    $running = @(Invoke-Tool docker @('ps', '--format', '{{.Ports}}'))
    if ($running -match "[:.]$ScratchPort->") { throw "Port $ScratchPort is already in use" }
    # Windows/Hyper-V reserves changing port ranges; fail early with a clear hint.
    try { $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $ScratchPort); $probe.Start(); $probe.Stop() }
    catch { throw "Port $ScratchPort cannot be bound (see 'netsh int ipv4 show excludedportrange protocol=tcp'); pass -ScratchPort" }
    $password = [guid]::NewGuid().ToString('N')   # scratch only, never printed
    Invoke-Tool docker @('run', '-d', '--rm', '--name', $scratch,
      '-p', "127.0.0.1:${ScratchPort}:5432",
      '-e', "POSTGRES_PASSWORD=$password", '-e', "POSTGRES_DB=$Database",
      '-v', "${WorkDir}:/work", $PgImage) | Out-Null
    $script:scratchStarted = $true
    Wait-PostgresReady -Container $scratch
  } $timings $logFile

  Measure-Step 'pg_restore' {
    Invoke-Tool docker @('exec', $scratch, 'pg_restore', '-U', 'postgres', '-d', $Database, '--no-owner', '--exit-on-error', "/work/$base.dump") | Out-Null
  } $timings $logFile

  Measure-Step 'compare-row-counts' {
    $tables = @($manifest.rowCounts.PSObject.Properties.Name)
    $sql = ($tables | ForEach-Object { "select '$_', count(*) from public.""$_"";" }) -join "`n"
    $restored = @{}
    foreach ($line in Invoke-Tool docker @('exec', '-i', $scratch, 'psql', '-U', 'postgres', '-d', $Database, '-At', '-F', '|', '-X') -StdIn $sql) {
      $p = $line.Split('|'); if ($p.Count -eq 2) { $restored[$p[0]] = [int64]$p[1] }
    }
    $script:countRows = foreach ($t in $tables) {
      $expected = [int64]$manifest.rowCounts.$t
      $got = if ($restored.ContainsKey($t)) { $restored[$t] } else { -1 }
      [pscustomobject]@{ Table = $t; Expected = $expected; Restored = $got; Ok = ($expected -eq $got) }
    }
    $mismatch = @($countRows | Where-Object { -not $_.Ok })
    if ($mismatch.Count) { throw "Row count mismatch: $(($mismatch | ForEach-Object { "$($_.Table) $($_.Restored)/$($_.Expected)" }) -join ', ')" }
    Write-Log "row counts match for $($tables.Count) tables" $logFile

    $checks = foreach ($col in $manifest.redactedColumns) {
      $t, $c = $col.Split('.', 2)
      "select '$col', count(*) from public.""$t"" where ""$c"" is not null and ""$c""::text <> '';"
    }
    $bad = @(Invoke-Tool docker @('exec', '-i', $scratch, 'psql', '-U', 'postgres', '-d', $Database, '-At', '-F', '|', '-X') -StdIn ($checks -join "`n") |
        Where-Object { $_ -match '\|' -and $_.Split('|')[1] -ne '0' })
    if ($bad.Count) { throw "Restored data holds content in redacted columns: $($bad -join ', ')" }
    $script:redactionOk = $true
  } $timings $logFile

  # Control I3: the audit log must stay append-only after a restore. Runs on the
  # SCRATCH copy only; each statement must be rejected by the trigger.
  Measure-Step 'verify-audit-append-only' {
    $script:appendOnly = [ordered]@{}
    $probe = @{
      INSERT   = 'insert into "CategorizeAuditEvent" (id, "eventType") values (''restore_probe'', ''restore_test'');'
      UPDATE   = 'update "CategorizeAuditEvent" set "eventType" = ''tampered'';'
      DELETE   = 'delete from "CategorizeAuditEvent";'
      TRUNCATE = 'truncate "CategorizeAuditEvent";'
    }
    foreach ($op in 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE') {
      $out = $probe[$op] | & docker exec -i $scratch psql -U postgres -d $Database -v ON_ERROR_STOP=1 -X -q 2>&1 | ForEach-Object { "$_" }
      $rejected = ($LASTEXITCODE -ne 0) -and (($out -join ' ') -match 'append-only')
      $appendOnly[$op] = if ($op -eq 'INSERT') { -not $rejected } else { $rejected }
    }
    Write-Log ("append-only: " + (($appendOnly.GetEnumerator() | ForEach-Object { "$($_.Key)=$(if ($_.Value) { 'ok' } else { 'FAILED' })" }) -join ', ')) $logFile
    if (@($appendOnly.Values | Where-Object { -not $_ }).Count) { throw 'Audit log is not append-only in the restored database' }
  } $timings $logFile

  Measure-Step 'stop-scratch-db' {
    Invoke-Tool docker @('stop', $scratch) | Out-Null
    $script:scratchStarted = $false
    Remove-Item -LiteralPath $dumpPath -Force
  } $timings $logFile

  Measure-Step 'tamper-test' {
    $tdir = Join-Path $WorkDir 'tamper'
    New-Item -ItemType Directory -Force -Path $tdir | Out-Null
    foreach ($suffix in '.dump.age', '.manifest.json', '.sha256') {
      Copy-Item -LiteralPath (Join-Path $BackupDir ($base + $suffix)) -Destination $tdir
      (Get-Item -LiteralPath (Join-Path $tdir ($base + $suffix))).IsReadOnly = $false
    }
    $agePath = Join-Path $tdir "$base.dump.age"
    $bytes = [IO.File]::ReadAllBytes($agePath)
    $bytes[[int]($bytes.Length / 2)] = $bytes[[int]($bytes.Length / 2)] -bxor 0x01
    [IO.File]::WriteAllBytes($agePath, $bytes)
    $out = Join-Path $tdir 'tampered.dump'

    try { Invoke-VerifiedDecrypt -Dir $tdir -Base $base -OutFile $out; $tamper.checksum = 'FAIL: altered copy was accepted' }
    catch { $tamper.checksum = "PASS: $($_.Exception.Message)" }

    # An attacker who can also rewrite the checksum file: age must still refuse.
    $sums = @("{0}  {1}" -f (Get-FileSha256 $agePath), "$base.dump.age",
      "{0}  {1}" -f (Get-FileSha256 (Join-Path $tdir "$base.manifest.json")), "$base.manifest.json")
    Write-Utf8NoBom (Join-Path $tdir "$base.sha256") (($sums -join "`n") + "`n")
    try { Invoke-VerifiedDecrypt -Dir $tdir -Base $base -OutFile $out; $tamper.age = 'FAIL: altered copy was decrypted' }
    catch { $tamper.age = "PASS: $($_.Exception.Message)" }
    Write-Log "tamper: checksum -> $($tamper.checksum); age -> $($tamper.age)" $logFile
    if (-not ($tamper.checksum.StartsWith('PASS') -and $tamper.age.StartsWith('PASS'))) { throw 'Tamper test failed: an altered backup was accepted' }
  } $timings $logFile

  $status = 'PASS'
} catch {
  $errorText = $_.Exception.Message
  Write-Log "ERROR $errorText" $logFile
} finally {
  if ($scratchStarted) { & docker stop $scratch 2>$null | Out-Null }
  if (Test-Path -LiteralPath $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }
  $total.Stop()
  $timings['total'] = [math]::Round($total.Elapsed.TotalSeconds, 2)
}

# Recovery time = everything needed to get the data back (tamper test excluded).
$rtoSteps = 'verify-checksum-and-decrypt', 'start-scratch-db', 'pg_restore', 'compare-row-counts'
$rto = [math]::Round((($rtoSteps | Where-Object { $timings.Contains($_) } | ForEach-Object { $timings[$_] }) | Measure-Object -Sum).Sum, 2)

# Backup timings for the same set, from the backup log.
$backupTimings = $null
if ($base) {
  $logs = Get-ChildItem -LiteralPath $LogDir -Filter 'backup-*.log' -ErrorAction SilentlyContinue | Sort-Object Name -Descending
  foreach ($l in $logs) {
    $lines = Get-Content -LiteralPath $l.FullName
    $start = [array]::FindIndex([string[]]$lines, [Predicate[string]] { param($x) $x -like "*=== CategorAIze backup $base ===*" })
    if ($start -ge 0) {
      $t = $lines[$start..($lines.Count - 1)] | Where-Object { $_ -match 'TIMINGS ' } | Select-Object -First 1
      if ($t) { $backupTimings = ($t -replace '^.*TIMINGS ', '') }
      break
    }
  }
}

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# Backup and restore test report')
[void]$md.AppendLine()
[void]$md.AppendLine('Written by `scripts/backup/restore-test.ps1` (IAS Phase 7 A). Do not edit by hand; rerun the script.')
[void]$md.AppendLine()
[void]$md.AppendLine("| | |")
[void]$md.AppendLine("| --- | --- |")
[void]$md.AppendLine("| Result | **$status** |")
[void]$md.AppendLine("| Run at | $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')) |")
[void]$md.AppendLine("| Backup set | ``$base`` in ``$BackupDir`` |")
if ($manifest) {
  [void]$md.AppendLine("| Backup created | $($manifest.createdAt) |")
  [void]$md.AppendLine("| Server / pg_dump | $($manifest.serverVersion) / $($manifest.pgDumpVersion) |")
  [void]$md.AppendLine("| Encrypted size | $($manifest.encryptedBytes) bytes (age, X25519) |")
  [void]$md.AppendLine("| Schema version | ``$($manifest.latestMigration)`` |")
}
[void]$md.AppendLine("| Scratch database | new container ``$scratch``, image ``$PgImage``, 127.0.0.1:$ScratchPort (removed after the test; the live DB is not touched) |")
[void]$md.AppendLine("| Measured restore time (RTO part) | **$rto s** (checksum + decrypt + start DB + pg_restore + checks) |")
if ($backupTimings) { [void]$md.AppendLine("| Backup run timings | $backupTimings |") }
if ($errorText) { [void]$md.AppendLine("| Error | $($errorText.Replace('|', '/')) |") }
[void]$md.AppendLine()
[void]$md.AppendLine('## Steps')
[void]$md.AppendLine()
[void]$md.AppendLine('| Step | Seconds |')
[void]$md.AppendLine('| --- | ---: |')
foreach ($k in $timings.Keys) { [void]$md.AppendLine("| $k | $($timings[$k]) |") }
[void]$md.AppendLine()
[void]$md.AppendLine('## Row counts (manifest vs restored)')
[void]$md.AppendLine()
[void]$md.AppendLine('| Table | Expected | Restored | Match |')
[void]$md.AppendLine('| --- | ---: | ---: | --- |')
foreach ($r in $countRows) { [void]$md.AppendLine("| $($r.Table) | $($r.Expected) | $($r.Restored) | $(if ($r.Ok) { 'yes' } else { '**NO**' }) |") }
[void]$md.AppendLine()
[void]$md.AppendLine('## Content and secret redaction')
[void]$md.AppendLine()
if ($manifest) {
  [void]$md.AppendLine("Columns that must be empty in every backup ($(@($manifest.redactedColumns).Count)): " + ((@($manifest.redactedColumns) | ForEach-Object { "``$_``" }) -join ', ') + '.')
  [void]$md.AppendLine()
}
[void]$md.AppendLine("Checked in the restored database: **$(if ($redactionOk) { 'all empty' } else { 'not verified' })**.")
[void]$md.AppendLine()
[void]$md.AppendLine('## Audit log stays append-only (control I3)')
[void]$md.AppendLine()
[void]$md.AppendLine('Run against the scratch copy only. INSERT must work; UPDATE, DELETE and TRUNCATE must be rejected by the trigger.')
[void]$md.AppendLine()
if ($appendOnly.Count) {
  foreach ($k in $appendOnly.Keys) { [void]$md.AppendLine("- ${k}: $(if ($appendOnly[$k]) { 'as expected' } else { '**FAILED**' })") }
} else {
  [void]$md.AppendLine('- not run')
}
[void]$md.AppendLine()
[void]$md.AppendLine('## Tamper test')
[void]$md.AppendLine()
[void]$md.AppendLine('One byte of a copy of the encrypted file was flipped.')
[void]$md.AppendLine()
[void]$md.AppendLine("- Checksum check: $($tamper.checksum)")
[void]$md.AppendLine("- Checksum file rewritten to match, age decryption: $($tamper.age)")
Write-Utf8NoBom ([IO.Path]::GetFullPath($ReportPath)) $md.ToString()
Write-Log "report written to $([IO.Path]::GetFullPath($ReportPath))" $logFile

try {
  $meta = @{ status = $status; name = "$base"; seconds = $timings['total']; restoreSeconds = $rto; tamperRefused = ($tamper.checksum.StartsWith('PASS') -and $tamper.age.StartsWith('PASS')) }
  if ($errorText) { $meta['error'] = $errorText.Substring(0, [Math]::Min(180, $errorText.Length)) }
  $auditId = Add-AuditEvent -Container $LiveContainer -Database $Database -EventType 'restore_test' -Metadata $meta
  Write-Log "AUDIT restore_test recorded ($auditId)" $logFile
} catch {
  Write-Log "WARNING could not record the restore_test audit event: $($_.Exception.Message)" $logFile
}
Write-Log ("TIMINGS " + (($timings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)s" }) -join ', ')) $logFile
Write-Log "=== restore test $status ===" $logFile
if ($status -ne 'PASS') { exit 1 }
