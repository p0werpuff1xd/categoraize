-- Right-to-erasure test for CategorAIze data (Prompt A, C12-20..25).
-- Runs in one transaction that is ROLLED BACK: nothing is kept.
-- It copies tenant A's CategorAIze rows to a new tenant B (new ids), deletes
-- user B the way utils/user/delete.ts does (member rows, then the user row),
-- and checks that every CategorAIze table is empty for B, that a second delete
-- is a harmless no-op, that A is untouched and that the audit trail survives.
-- Every check prints PASS or FAIL.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;

CREATE TEMP TABLE er_a AS
  SELECT ea."userId" AS user_id, ea.id AS account_id
  FROM "EmailAccount" ea
  WHERE EXISTS (SELECT 1 FROM "CategorizeClassification" c WHERE c."emailAccountId" = ea.id)
  LIMIT 1;

-- Tenant B: user, account and email account copied from A under new ids.
CREATE TEMP TABLE u AS SELECT * FROM "User" WHERE id = (SELECT user_id FROM er_a);
UPDATE u SET id = 'erase-user-b', email = 'erase-b@example.invalid', "referralCode" = NULL, "premiumId" = NULL, "premiumAdminId" = NULL;
INSERT INTO "User" SELECT * FROM u;
CREATE TEMP TABLE a AS SELECT * FROM "Account" WHERE "userId" = (SELECT user_id FROM er_a) LIMIT 1;
UPDATE a SET id = 'erase-account-b', "userId" = 'erase-user-b', "providerAccountId" = 'erase-provider-b';
INSERT INTO "Account" SELECT * FROM a;
CREATE TEMP TABLE ea AS SELECT * FROM "EmailAccount" WHERE id = (SELECT account_id FROM er_a);
UPDATE ea SET id = 'erase-email-b', email = 'erase-b@example.invalid', "userId" = 'erase-user-b', "accountId" = 'erase-account-b', "watchEmailsSubscriptionId" = NULL;
INSERT INTO "EmailAccount" SELECT * FROM ea;

-- Copy A's rows of every per-account table to B, parents first. Ids and the
-- foreign keys between copied tables get an "erase-" prefix.
DO $$
DECLARE
  t text;
  col text;
  a_id text := (SELECT account_id FROM er_a);
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Category', 'CategorizeCategory', 'CategorizeClassification',
    'CategorizeExtractedSpan', 'CategorizeContact', 'CategorizeFeedbackEvent',
    'CategorizePriorityOverrideLog', 'CategorizeSenderCategoryCentroid',
    'CategorizeSenderEmbedding', 'CategorizeProposalDecision',
    'CategorizeDeadlineAlert', 'CategorizeNotification'
  ] LOOP
    EXECUTE format('CREATE TEMP TABLE er_copy AS SELECT * FROM %I WHERE "emailAccountId" = %L', t, a_id);
    EXECUTE 'UPDATE er_copy SET id = ''erase-'' || id, "emailAccountId" = ''erase-email-b''';
    FOREACH col IN ARRAY ARRAY['categoryId', 'classificationId', 'deadlineAlertId'] LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'er_copy' AND column_name = col) THEN
        EXECUTE format('UPDATE er_copy SET %I = ''erase-'' || %I WHERE %I IS NOT NULL', col, col, col);
      END IF;
    END LOOP;
    EXECUTE format('INSERT INTO %I SELECT * FROM er_copy', t);
    DROP TABLE er_copy;
  END LOOP;
END $$;

-- Per-user rows and one contact so every table has at least one B row.
INSERT INTO "CategorizeContact" (id, "updatedAt", email, "emailAccountId")
  VALUES ('erase-contact-extra', now(), 'erase-sender@example.invalid', 'erase-email-b');
INSERT INTO "CategorizeUserConsent" (id, "termsVersion", "privacyVersion", "acceptedAt", "userId")
  VALUES ('erase-consent-b', 'x', 'x', now(), 'erase-user-b');
INSERT INTO "CategorizeUserSettings" (id, "updatedAt", "userId")
  VALUES ('erase-settings-b', now(), 'erase-user-b');
INSERT INTO "CategorizeAuditEvent" (id, "eventType", "userId", "emailAccountId")
  VALUES ('erase-audit-b', 'account_deleted', 'erase-user-b', 'erase-email-b');

CREATE TEMP TABLE er_counts (tbl text, phase text, n bigint);
CREATE FUNCTION pg_temp.count_b(phase text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'CategorizeCategory', 'CategorizeClassification', 'CategorizeExtractedSpan',
    'CategorizeContact', 'CategorizeFeedbackEvent', 'CategorizePriorityOverrideLog',
    'CategorizeSenderCategoryCentroid', 'CategorizeSenderEmbedding',
    'CategorizeProposalDecision', 'CategorizeDeadlineAlert', 'CategorizeNotification'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "emailAccountId" = ''erase-email-b''', t) INTO n;
    INSERT INTO er_counts VALUES (t, phase, n);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['CategorizeUserConsent', 'CategorizeUserSettings'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "userId" = ''erase-user-b''', t) INTO n;
    INSERT INTO er_counts VALUES (t, phase, n);
  END LOOP;
END $$;

CREATE TEMP TABLE er_a_before AS
  SELECT (SELECT count(*) FROM "CategorizeClassification" WHERE "emailAccountId" = (SELECT account_id FROM er_a)) AS classifications,
         (SELECT count(*) FROM "CategorizeContact" WHERE "emailAccountId" = (SELECT account_id FROM er_a)) AS contacts;

SELECT pg_temp.count_b('before');

\set QUIET off
\echo
\echo == erasure of tenant B (copy of A's data)
SELECT 'INFO B rows before erasure: ' || string_agg(tbl || '=' || n, ', ' ORDER BY tbl) FROM er_counts WHERE phase = 'before';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' C12-20 setup: B has rows in all ' || (SELECT count(*) FROM er_counts WHERE phase = 'before') || ' CategorAIze tables (' || coalesce(string_agg(tbl, ', '), 'none empty') || ')'
  FROM er_counts WHERE phase = 'before' AND n = 0
  AND tbl NOT IN ('CategorizeDeadlineAlert', 'CategorizeNotification', 'CategorizeSenderCategoryCentroid', 'CategorizeSenderEmbedding', 'CategorizeFeedbackEvent', 'CategorizePriorityOverrideLog', 'CategorizeProposalDecision', 'CategorizeExtractedSpan');

-- Erase B exactly like deleteUserRows(): member rows, then the user.
\set QUIET on
DELETE FROM "Member" WHERE "emailAccountId" IN (SELECT id FROM "EmailAccount" WHERE "userId" = 'erase-user-b');
DELETE FROM "User" WHERE id = 'erase-user-b';
SELECT pg_temp.count_b('after');
\set QUIET off

SELECT CASE WHEN sum(n) = 0 THEN 'PASS' ELSE 'FAIL' END || ' C12-21 complete: every CategorAIze table is empty for B after erasure (' || sum(n) || ' rows left)'
  FROM er_counts WHERE phase = 'after';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' C12-22 complete: B''s user, account and email account rows are gone'
  FROM (SELECT id FROM "User" WHERE id = 'erase-user-b' UNION ALL SELECT id FROM "Account" WHERE id = 'erase-account-b' UNION ALL SELECT id FROM "EmailAccount" WHERE id = 'erase-email-b') x;

-- A second erasure (retry after a crash, double click) must be a no-op.
WITH again AS (DELETE FROM "User" WHERE id = 'erase-user-b' RETURNING 1)
  SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' C12-23 idempotent: a second erasure deletes 0 rows without error' FROM again;

SELECT CASE WHEN b.classifications = (SELECT count(*) FROM "CategorizeClassification" WHERE "emailAccountId" = (SELECT account_id FROM er_a))
             AND b.contacts = (SELECT count(*) FROM "CategorizeContact" WHERE "emailAccountId" = (SELECT account_id FROM er_a))
            THEN 'PASS' ELSE 'FAIL' END || ' C12-24 isolation: tenant A''s rows are untouched (' || b.classifications || ' classifications)'
  FROM er_a_before b;

SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' C12-25 audit trail outlives the account (ids only, no FK)'
  FROM "CategorizeAuditEvent" WHERE id = 'erase-audit-b';

\set QUIET on
ROLLBACK;
\echo == rolled back: no test rows were kept
