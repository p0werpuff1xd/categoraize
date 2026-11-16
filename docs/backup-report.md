# Backup and restore test report

Written by `scripts/backup/restore-test.ps1` (IAS Phase 7 A). Do not edit by hand; rerun the script.

| | |
| --- | --- |
| Result | **PASS** |
| Run at | 2026-11-17 00:04:00 +08:00 |
| Backup set | `categoraize-20261116-235932` in `E:\backups\copy1` |
| Backup created | 2026-11-17T00:01:59.2951529+08:00 |
| Server / pg_dump | 16.15 (Debian 16.15-1.pgdg12+2) / pg_dump (PostgreSQL) 16.15 (Debian 16.15-1.pgdg12+2) |
| Encrypted size | 532741 bytes (age, X25519) |
| Schema version | `20261116120000_categoraize_audit_log` |
| Scratch database | new container `categoraize-restore-test-20261117-000200`, image `pgvector/pgvector:pg16`, 127.0.0.1:15433 (removed after the test; the live DB is not touched) |
| Measured restore time (RTO part) | **114.98 s** (checksum + decrypt + start DB + pg_restore + checks) |
| Backup run timings | preflight=7.47s, generate-copy-sql=0.4s, start-staging=11.09s, copy-schema-and-redacted-rows=123.25s, verify-redaction-and-count=0.77s, pg_dump=0.42s, stop-staging=3.49s, encrypt=0.02s, checksum-and-manifest=0.09s, copy-verify-readonly=0.06s, retention=0.06s, total=147.22s |

## Steps

| Step | Seconds |
| --- | ---: |
| verify-checksum-and-decrypt | 0.09 |
| start-scratch-db | 14.69 |
| pg_restore | 99.64 |
| compare-row-counts | 0.56 |
| verify-audit-append-only | 1.09 |
| stop-scratch-db | 4.32 |
| tamper-test | 0.1 |
| total | 120.58 |

## Row counts (manifest vs restored)

| Table | Expected | Restored | Match |
| --- | ---: | ---: | --- |
| CategorizeAuditEvent | 5 | 5 | yes |
| CategorizeCategory | 5 | 5 | yes |
| CategorizeClassification | 45 | 45 | yes |
| CategorizeContact | 5 | 5 | yes |
| CategorizeDeadlineAlert | 0 | 0 | yes |
| CategorizeExtractedSpan | 70 | 70 | yes |
| CategorizeFeedbackEvent | 1 | 1 | yes |
| CategorizeNotification | 0 | 0 | yes |
| CategorizePriorityOverrideLog | 5 | 5 | yes |
| CategorizeProposalDecision | 0 | 0 | yes |
| CategorizeSenderCategoryCentroid | 0 | 0 | yes |
| CategorizeSenderEmbedding | 0 | 0 | yes |
| CategorizeUserConsent | 3 | 3 | yes |
| Category | 0 | 0 | yes |
| EmailAccount | 1 | 1 | yes |
| Account | 1 | 1 | yes |
| Premium | 0 | 0 | yes |
| User | 1 | 1 | yes |
| _prisma_migrations | 323 | 323 | yes |

## Content and secret redaction

Columns that must be empty in every backup (18): `CategorizeClassification.aiReasoning`, `CategorizeClassification.summary`, `CategorizeClassification.actionDirective`, `CategorizeClassification.snippet`, `CategorizeClassification.bodyText`, `CategorizeClassification.subject`, `CategorizeDeadlineAlert.sourceText`, `CategorizeExtractedSpan.text`, `CategorizeNotification.title`, `CategorizeNotification.message`, `Account.refresh_token`, `Account.access_token`, `Account.token_type`, `Account.id_token`, `Account.password`, `Premium.appleAppAccountToken`, `User.aiApiKey`, `User.webhookSecret`.

Checked in the restored database: **all empty**.

## Audit log stays append-only (control I3)

Run against the scratch copy only. INSERT must work; UPDATE, DELETE and TRUNCATE must be rejected by the trigger.

- INSERT: as expected
- UPDATE: as expected
- DELETE: as expected
- TRUNCATE: as expected

## Tamper test

One byte of a copy of the encrypted file was flipped.

- Checksum check: PASS: REFUSED: checksum mismatch for categoraize-20261116-235932.dump.age
- Checksum file rewritten to match, age decryption: PASS: REFUSED: age could not decrypt/authenticate categoraize-20261116-235932.dump.age
