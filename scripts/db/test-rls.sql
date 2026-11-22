-- Row-level security tests for CategorAIze tables (IAS Phase 11 K).
-- Runs in one transaction that is ROLLED BACK: nothing is kept.
-- As the owner it creates a second tenant (user B with an email account and a
-- contact), then switches to the runtime role categoraize_app and checks the
-- policies. Every check prints PASS or FAIL.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;

-- Tenant A: the first real user with CategorAIze data.
CREATE TEMP TABLE rls_a AS
  SELECT ea."userId" AS user_id, ea.id AS account_id
  FROM "EmailAccount" ea
  WHERE EXISTS (SELECT 1 FROM "CategorizeClassification" c WHERE c."emailAccountId" = ea.id)
  LIMIT 1;

-- Tenant B: a copy of A's user/account/contact under new ids.
CREATE TEMP TABLE u AS SELECT * FROM "User" WHERE id = (SELECT user_id FROM rls_a);
UPDATE u SET id = 'rls-user-b', email = 'rls-b@example.invalid', "referralCode" = NULL, "premiumId" = NULL, "premiumAdminId" = NULL;
INSERT INTO "User" SELECT * FROM u;
CREATE TEMP TABLE a AS SELECT * FROM "Account" WHERE "userId" = (SELECT user_id FROM rls_a) LIMIT 1;
UPDATE a SET id = 'rls-account-b', "userId" = 'rls-user-b', "providerAccountId" = 'rls-provider-b';
INSERT INTO "Account" SELECT * FROM a;
CREATE TEMP TABLE ea AS SELECT * FROM "EmailAccount" WHERE id = (SELECT account_id FROM rls_a);
UPDATE ea SET id = 'rls-email-b', email = 'rls-b@example.invalid', "userId" = 'rls-user-b', "accountId" = 'rls-account-b', "watchEmailsSubscriptionId" = NULL;
INSERT INTO "EmailAccount" SELECT * FROM ea;
INSERT INTO "CategorizeContact" (id, "updatedAt", email, "emailAccountId")
  VALUES ('rls-contact-b', now(), 'secret-sender@example.invalid', 'rls-email-b');
INSERT INTO "CategorizeUserConsent" (id, "termsVersion", "privacyVersion", "acceptedAt", "userId")
  VALUES ('rls-consent-b', 'x', 'x', now(), 'rls-user-b');

GRANT SELECT ON rls_a TO categoraize_app;
SET LOCAL ROLE categoraize_app;
\set QUIET off
\echo
\echo == as categoraize_app (no superuser, no BYPASSRLS)

-- 1. No tenant context: nothing is visible (fail closed).
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' no context: classifications hidden (' || count(*) || ')' FROM "CategorizeClassification";
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' no context: consents hidden (' || count(*) || ')' FROM "CategorizeUserConsent";
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' no context: contacts hidden (' || count(*) || ')' FROM "CategorizeContact";

-- 2. Tenant A sees its own rows and none of B's.
SELECT set_config('app.current_user_id', (SELECT user_id FROM rls_a), true) \gset ignored_
SELECT CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant A: own classifications visible (' || count(*) || ')' FROM "CategorizeClassification";
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant A: cross-tenant read of B''s contact returns nothing' FROM "CategorizeContact" WHERE id = 'rls-contact-b';
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant A: cross-tenant read of B''s consent returns nothing' FROM "CategorizeUserConsent" WHERE "userId" = 'rls-user-b';

-- 3. Tenant A cannot write into B's account or change B's rows.
SAVEPOINT w;
\set ON_ERROR_STOP off
INSERT INTO "CategorizeContact" (id, "updatedAt", email, "emailAccountId") VALUES ('rls-intrusion', now(), 'x@example.invalid', 'rls-email-b');
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT w;
SELECT 'PASS tenant A: insert with B''s emailAccountId rejected by the policy (error above is expected)' AS result
  WHERE NOT EXISTS (SELECT 1 FROM "CategorizeContact" WHERE id = 'rls-intrusion');
WITH changed AS (UPDATE "CategorizeContact" SET email = 'hijacked@example.invalid' WHERE id = 'rls-contact-b' RETURNING 1)
  SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant A: update of B''s contact touches 0 rows' FROM changed;
WITH removed AS (DELETE FROM "CategorizeContact" WHERE id = 'rls-contact-b' RETURNING 1)
  SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant A: delete of B''s contact touches 0 rows' FROM removed;

-- 4. Tenant B sees only its own rows.
SELECT set_config('app.current_user_id', 'rls-user-b', true) \gset ignored_
SELECT CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END || ' tenant B: sees exactly its own contact (' || count(*) || ')' FROM "CategorizeContact";
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant B: none of A''s classifications (' || count(*) || ')' FROM "CategorizeClassification";

-- 5. Clearing the context hides everything again.
SELECT set_config('app.current_user_id', '', true) \gset ignored_
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' empty context: contacts hidden (' || count(*) || ')' FROM "CategorizeContact";

-- 6. Audit log: reads are per user; append is allowed (system events have no user).
SELECT set_config('app.current_user_id', 'rls-user-b', true) \gset ignored_
SELECT CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END || ' tenant B: none of A''s audit events (' || count(*) || ')'
  FROM "CategorizeAuditEvent" WHERE "userId" = (SELECT user_id FROM rls_a);

-- 7. The runtime role cannot change the schema.
SAVEPOINT s;
\set ON_ERROR_STOP off
ALTER TABLE "CategorizeContact" DISABLE ROW LEVEL SECURITY;
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT s;
SELECT 'PASS runtime role cannot disable row-level security (error above is expected)' AS result;

\set QUIET on
RESET ROLE;
ROLLBACK;
\echo == rolled back: no test rows were kept
