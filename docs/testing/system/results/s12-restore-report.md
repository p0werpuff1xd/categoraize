# Backup and restore test report

Written by `scripts/backup/restore-test.ps1` (IAS Phase 7 A). Do not edit by hand; rerun the script.

| | |
| --- | --- |
| Result | **PASS** |
| Run at | 2026-11-20 01:41:06 +08:00 |
| Backup set | `categoraize-20261120-013535` in `D:\categoraize-backups\copy2` |
| Backup created | 2026-11-20T01:38:21.8697185+08:00 |
| Server / pg_dump | 16.15 (Debian 16.15-1.pgdg12+2) / pg_dump (PostgreSQL) 16.15 (Debian 16.15-1.pgdg12+2) |
| Encrypted size | 616324 bytes (age, X25519) |
| Schema version | `20261119030000_categoraize_app_upstream_access` |
| Scratch database | new container `categoraize-restore-test-20261120-013830`, image `pgvector/pgvector:pg16`, 127.0.0.1:15433 (removed after the test; the live DB is not touched) |
| Measured restore time (RTO part) | **148.95 s** (checksum + decrypt + start DB + pg_restore + checks) |
| Backup run timings | preflight=8.32s, generate-copy-sql=0.38s, start-staging=10.37s, copy-schema-and-redacted-rows=140.98s, verify-redaction-and-count=0.72s, pg_dump=0.43s, stop-staging=4.83s, encrypt=0.09s, checksum-and-manifest=0.12s, copy-verify-readonly=0.46s, retention=0.12s, total=166.94s |

## Steps

| Step | Seconds |
| --- | ---: |
| verify-checksum-and-decrypt | 0.1 |
| start-scratch-db | 11.63 |
| pg_restore | 136.72 |
| compare-row-counts | 0.5 |
| verify-audit-append-only | 0.98 |
| stop-scratch-db | 5.21 |
| tamper-test | 0.11 |
| total | 155.33 |

## Row counts (manifest vs restored)

| Table | Expected | Restored | Match |
| --- | ---: | ---: | --- |
| CategorizeAuditEvent | 23 | 23 | yes |
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
| CategorizeUserConsent | 4 | 4 | yes |
| Category | 0 | 0 | yes |
| EmailAccount | 1 | 1 | yes |
| Account | 1 | 1 | yes |
| Premium | 0 | 0 | yes |
| User | 1 | 1 | yes |
| _prisma_migrations | 326 | 326 | yes |

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

- Checksum check: PASS: REFUSED: checksum mismatch for categoraize-20261120-013535.dump.age
- Checksum file rewritten to match, age decryption: PASS: REFUSED: age could not decrypt/authenticate categoraize-20261120-013535.dump.age
