<#
.SYNOPSIS
  Weekly security review of the audit log. Read-only; prints IDs, counts and
  flags, never content.

.DESCRIPTION
  Flags:
  - repeated token failures: >= 3 account_disconnected (invalid_token) per user
  - connect/disconnect bursts: >= 5 account_connected/disconnected per user in 24 h
  - NLP service 401 spikes: >= 10 nlp_auth_failure_count in one hour
  - deletion requests: every data_deletion_requested, and any without a
    matching data_deletion_completed
  - consent withdrawals and external-AI changes, for awareness
  Exit code 1 when anything needs attention, so it can run from Task Scheduler.

.EXAMPLE
  .\scripts\audit\review.ps1 -Days 7
#>
param(
  [int]$Days = 7,
  [string]$Container = 'inbox-zero-services-db-1',
  [string]$Database = 'inboxzero'
)

$ErrorActionPreference = 'Stop'

function Invoke-Query([string]$Sql) {
  $out = $Sql | & docker exec -i $Container psql -U postgres -d $Database -At -F ' | ' -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $out" }
  return @($out | Where-Object { $_ -ne '' })
}

$window = "now() - interval '$Days days'"
$checks = [ordered]@{
  'Repeated token failures (>= 3 per user)' = @"
select coalesce("userId", '-'), count(*) from "CategorizeAuditEvent"
where "eventType" = 'account_disconnected' and metadata->>'reason' = 'invalid_token' and "createdAt" >= $window
group by "userId" having count(*) >= 3 order by 2 desc;
"@
  'Connect/disconnect bursts (>= 5 per user in 24 h)' = @"
select coalesce("userId", "emailAccountId", '-'), date_trunc('day', "createdAt")::date, count(*) from "CategorizeAuditEvent"
where "eventType" in ('account_connected', 'account_disconnected') and "createdAt" >= $window
group by 1, 2 having count(*) >= 5 order by 3 desc;
"@
  'NLP service 401 spikes (>= 10 in one hour)' = @"
select date_trunc('hour', "createdAt"), count(*) from "CategorizeAuditEvent"
where "eventType" = 'nlp_auth_failure_count' and "createdAt" >= $window
group by 1 having count(*) >= 10 order by 1;
"@
  'Deletion requests without a completed deletion' = @"
select r."userId", r."createdAt" from "CategorizeAuditEvent" r
where r."eventType" = 'data_deletion_requested' and r."createdAt" >= $window
  and not exists (select 1 from "CategorizeAuditEvent" c
                  where c."eventType" = 'data_deletion_completed' and c."userId" = r."userId" and c."createdAt" >= r."createdAt");
"@
}
$info = [ordered]@{
  'Deletions completed' = "select ""userId"", ""createdAt"" from ""CategorizeAuditEvent"" where ""eventType"" = 'data_deletion_completed' and ""createdAt"" >= $window order by 2;"
  'Consent withdrawals' = "select ""userId"", ""createdAt"" from ""CategorizeAuditEvent"" where ""eventType"" = 'consent_withdrawn' and ""createdAt"" >= $window order by 2;"
  'External AI changes' = "select ""userId"", metadata->>'enabled', ""createdAt"" from ""CategorizeAuditEvent"" where ""eventType"" = 'external_llm_toggled' and ""createdAt"" >= $window order by 3;"
  'Event counts' = "select ""eventType"", count(*) from ""CategorizeAuditEvent"" where ""createdAt"" >= $window group by 1 order by 2 desc;"
}

Write-Host "CategorAIze audit review, last $Days day(s), $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$attention = 0
foreach ($name in $checks.Keys) {
  $rows = Invoke-Query $checks[$name]
  if ($rows.Count) {
    $attention += $rows.Count
    Write-Host "`n[ATTENTION] $name"
    $rows | ForEach-Object { Write-Host "  $_" }
  } else {
    Write-Host "`n[ok] $name"
  }
}
foreach ($name in $info.Keys) {
  $rows = Invoke-Query $info[$name]
  Write-Host "`n[info] $name ($($rows.Count))"
  $rows | ForEach-Object { Write-Host "  $_" }
}

if ($attention) {
  Write-Host "`n$attention item(s) need attention. See docs/ias/incident-response.md."
  exit 1
}
Write-Host "`nNothing needs attention."
