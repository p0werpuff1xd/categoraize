# Shared helpers for backup.ps1 and restore-test.ps1 (IAS Phase 7 A).
# Dot-source this file; it defines functions only and touches nothing.
# Windows PowerShell 5.1 compatible.

Set-StrictMode -Version 2.0

# Tables whose ROWS are backed up. Everything else is backed up as schema only
# (empty tables), so a restore yields a complete, migratable database.
# CategorAIze-owned tables plus the settings/identity rows their foreign keys
# need (User, EmailAccount, Account, Premium, Category) and the migration log.
$script:BackupDataTables = @(
  'CategorizeAuditEvent',
  'CategorizeCategory',
  'CategorizeClassification',
  'CategorizeContact',
  'CategorizeDeadlineAlert',
  'CategorizeExtractedSpan',
  'CategorizeFeedbackEvent',
  'CategorizeNotification',
  'CategorizePriorityOverrideLog',
  'CategorizeProposalDecision',
  'CategorizeSenderCategoryCentroid',
  'CategorizeSenderEmbedding',
  'CategorizeUserConsent',
  'Category',
  'EmailAccount',
  'Account',
  'Premium',
  'User',
  '_prisma_migrations'
)

# Columns that must never leave the live database: email content and secrets.
# Value is the SQL expression copied instead (NULL, or '' for NOT NULL columns).
$script:BackupRedactions = @{
  'CategorizeClassification' = @{
    'bodyText' = 'NULL'; 'snippet' = 'NULL'; 'subject' = 'NULL'; 'summary' = 'NULL'
    'aiReasoning' = 'NULL'; 'actionDirective' = 'NULL'
  }
  'CategorizeExtractedSpan'  = @{ 'text' = "''" }
  'CategorizeDeadlineAlert'  = @{ 'sourceText' = 'NULL' }
  'CategorizeNotification'   = @{ 'title' = "''"; 'message' = "''" }
  'Account'                  = @{
    'access_token' = 'NULL'; 'refresh_token' = 'NULL'; 'id_token' = 'NULL'; 'password' = 'NULL'
  }
  'User'                     = @{ 'aiApiKey' = 'NULL'; 'webhookSecret' = 'NULL' }
}

# Any other text column in a backed-up table whose name looks secret is blanked too.
$script:SecretColumnPattern = '(?i)(token|secret|password|api_?key|private_?key)'

function Write-Log {
  param([string]$Message, [string]$LogFile)
  $line = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  if ($LogFile) { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 }
}

# Runs a native tool, returns its stdout lines, throws on a non-zero exit code.
# Arguments must not contain secrets: they can show up in error messages.
function Invoke-Tool {
  param([string]$Exe, [string[]]$Arguments, [string]$StdIn)
  if ($PSBoundParameters.ContainsKey('StdIn')) {
    $out = $StdIn | & $Exe @Arguments 2>&1
  } else {
    $out = & $Exe @Arguments 2>&1
  }
  $code = $LASTEXITCODE
  $lines = @($out | ForEach-Object { "$_" })
  if ($code -ne 0) {
    $tail = ($lines | Select-Object -Last 8) -join ' | '
    throw "$Exe $($Arguments[0]) failed (exit $code): $tail"
  }
  return $lines
}

# Times a script block; returns its result and records the seconds in $Timings.
function Measure-Step {
  param([string]$Name, [scriptblock]$Block, [System.Collections.Specialized.OrderedDictionary]$Timings, [string]$LogFile)
  Write-Log "START $Name" $LogFile
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $result = & $Block
  } finally {
    $sw.Stop()
    $Timings[$Name] = [math]::Round($sw.Elapsed.TotalSeconds, 2)
  }
  Write-Log ("DONE  {0} in {1}s" -f $Name, $Timings[$Name]) $LogFile
  return $result
}

function Get-FileSha256 {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

# Checksum file format: "<sha256>  <file name>" per line (sha256sum compatible).
function Test-ChecksumFile {
  param([string]$ChecksumFile)
  $dir = Split-Path -Parent $ChecksumFile
  $results = @()
  foreach ($line in Get-Content -LiteralPath $ChecksumFile) {
    if ($line -notmatch '^([0-9a-f]{64})\s+\*?(.+)$') { continue }
    $expected = $Matches[1]; $name = $Matches[2].Trim()
    $path = Join-Path $dir $name
    $actual = if (Test-Path -LiteralPath $path) { Get-FileSha256 $path } else { 'missing' }
    $results += [pscustomobject]@{ File = $name; Ok = ($actual -eq $expected) }
  }
  if ($results.Count -eq 0) { throw "No checksums found in $ChecksumFile" }
  return $results
}

function Get-PgMajor {
  param([string]$VersionText)
  if ($VersionText -match '(\d+)(\.\d+)?') { return [int]$Matches[1] }
  throw "Cannot parse a Postgres version from '$VersionText'"
}

# Waits until a freshly started postgres container has finished initdb and
# accepts connections on its unix socket.
function Wait-PostgresReady {
  param([string]$Container, [int]$Port = 5432, [int]$TimeoutSeconds = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $logs = (& docker logs $Container 2>&1 | ForEach-Object { "$_" }) -join "`n"
    if ($logs -match 'PostgreSQL init process complete') {
      & docker exec $Container pg_isready -q -U postgres -p $Port 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { return }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Postgres in $Container did not become ready within $TimeoutSeconds s"
}

function ConvertTo-SqlLiteral {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

# Appends one row to the append-only audit log in the LIVE local database.
# Insert only; the table's trigger rejects UPDATE/DELETE anyway.
function Add-AuditEvent {
  param([string]$Container, [string]$Database, [string]$EventType, [hashtable]$Metadata)
  $id = 'sys_' + [guid]::NewGuid().ToString('N')
  $json = ($Metadata | ConvertTo-Json -Compress -Depth 4)
  $sql = 'INSERT INTO "CategorizeAuditEvent" (id, "eventType", metadata) VALUES (' +
    (ConvertTo-SqlLiteral $id) + ', ' + (ConvertTo-SqlLiteral $EventType) + ', ' +
    (ConvertTo-SqlLiteral $json) + '::jsonb);'
  Invoke-Tool docker @('exec', '-i', $Container, 'psql', '-U', 'postgres', '-d', $Database, '-v', 'ON_ERROR_STOP=1', '-q') -StdIn $sql | Out-Null
  return $id
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Text)
  [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding $false))
}

# Retention: newest set per day for the last $KeepDaily days that have backups, plus the
# newest set per ISO week for the last $KeepWeekly weeks. Only sets OLDER than the oldest
# kept day are removed (read-only flag cleared first); each removal is logged.
function Invoke-Retention {
  param([string]$Folder, [int]$KeepDaily = 7, [int]$KeepWeekly = 4, [string]$LogFile)
  $pattern = '^categoraize-(\d{8})-(\d{6})\.dump\.age$'
  $sets = @(Get-ChildItem -LiteralPath $Folder -File | Where-Object { $_.Name -match $pattern } | ForEach-Object {
      $null = $_.Name -match $pattern
      $when = [datetime]::ParseExact($Matches[1] + $Matches[2], 'yyyyMMddHHmmss', $null)
      $cal = [Globalization.CultureInfo]::InvariantCulture.Calendar
      $week = '{0}-W{1:00}' -f $when.Year, $cal.GetWeekOfYear($when, [Globalization.CalendarWeekRule]::FirstFourDayWeek, [DayOfWeek]::Monday)
      [pscustomobject]@{ Base = $_.Name -replace '\.dump\.age$', ''; When = $when; Day = $when.ToString('yyyy-MM-dd'); Week = $week }
    } | Sort-Object When -Descending)
  if ($sets.Count -eq 0) { return }

  $dailyDays = @($sets | Select-Object -ExpandProperty Day -Unique | Select-Object -First $KeepDaily)
  $keep = @{}
  foreach ($day in $dailyDays) { $keep[($sets | Where-Object { $_.Day -eq $day } | Select-Object -First 1).Base] = 'daily' }
  $weeks = @($sets | Select-Object -ExpandProperty Week -Unique | Select-Object -First $KeepWeekly)
  foreach ($week in $weeks) {
    $b = ($sets | Where-Object { $_.Week -eq $week } | Select-Object -First 1).Base
    if (-not $keep.ContainsKey($b)) { $keep[$b] = 'weekly' }
  }
  # Only files OLDER than the oldest kept daily day may go; same-day extras inside
  # the daily window are kept.
  $oldestDaily = [datetime]::ParseExact($dailyDays[-1], 'yyyy-MM-dd', $null)
  foreach ($set in $sets) {
    if ($keep.ContainsKey($set.Base) -or $set.When -ge $oldestDaily) { continue }
    foreach ($suffix in '.dump.age', '.manifest.json', '.sha256') {
      $path = Join-Path $Folder ($set.Base + $suffix)
      if (Test-Path -LiteralPath $path) {
        (Get-Item -LiteralPath $path).IsReadOnly = $false
        Remove-Item -LiteralPath $path -Force
        Write-Log "RETENTION removed $path (older than the $KeepDaily daily / $KeepWeekly weekly sets)" $LogFile
      }
    }
  }
  Write-Log ("RETENTION {0}: {1} sets kept ({2})" -f $Folder, $keep.Count, (($keep.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', ')) $LogFile
}
