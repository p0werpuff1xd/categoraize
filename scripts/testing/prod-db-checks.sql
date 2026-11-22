-- Prompt B S10/S11: read-only checks on the production database.
-- Prints formats and counts only: never row content. Run inside a READ ONLY
-- transaction (scripts/testing/run-system-tests.ps1 does this with docker psql).
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;
\pset footer off
\pset format aligned

\echo == S10-E field-level encryption at rest (format e1:<key>:<iv>:<tag>:<ciphertext>)
WITH v AS (
  SELECT 'CategorizeClassification.subject' col, "subject" val FROM "CategorizeClassification"
  UNION ALL SELECT 'CategorizeClassification.snippet', "snippet" FROM "CategorizeClassification"
  UNION ALL SELECT 'CategorizeClassification.bodyText', "bodyText" FROM "CategorizeClassification"
  UNION ALL SELECT 'CategorizeClassification.summary', "summary" FROM "CategorizeClassification"
  UNION ALL SELECT 'CategorizeClassification.actionDirective', "actionDirective" FROM "CategorizeClassification"
  UNION ALL SELECT 'CategorizeExtractedSpan.text', "text" FROM "CategorizeExtractedSpan"
)
SELECT col, count(*) AS rows,
  count(*) FILTER (WHERE val IS NULL OR val = '') AS empty,
  count(*) FILTER (WHERE val ~ '^e1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$') AS encrypted,
  count(*) FILTER (WHERE val <> '' AND val !~ '^e1:') AS plaintext,
  string_agg(DISTINCT split_part(val, ':', 2), ',') FILTER (WHERE val ~ '^e1:') AS key_ids
FROM v GROUP BY col ORDER BY col;

SELECT CASE WHEN count(*) FILTER (WHERE val <> '' AND val !~ '^e1:') = 0 THEN 'PASS' ELSE 'FAIL' END
  || ' S10-E01 no plaintext in encrypted columns (' || count(*) FILTER (WHERE val ~ '^e1:') || ' encrypted values)'
FROM (
  SELECT "subject" val FROM "CategorizeClassification" UNION ALL SELECT "snippet" FROM "CategorizeClassification"
  UNION ALL SELECT "bodyText" FROM "CategorizeClassification" UNION ALL SELECT "summary" FROM "CategorizeClassification"
  UNION ALL SELECT "actionDirective" FROM "CategorizeClassification" UNION ALL SELECT "text" FROM "CategorizeExtractedSpan"
) x;

\echo == S10-F row-level security configuration
SELECT c.relname AS table, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS forced,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'Categorize%' ORDER BY 1;

SELECT CASE WHEN bool_and(c.relrowsecurity AND c.relforcerowsecurity
              AND EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname)) THEN 'PASS' ELSE 'FAIL' END
  || ' S10-F01 RLS forced with a policy on all ' || count(*) || ' CategorAIze tables'
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'Categorize%';

SELECT CASE WHEN NOT rolsuper AND NOT rolbypassrls THEN 'PASS' ELSE 'FAIL' END
  || ' S10-F02 runtime role categoraize_app is not superuser and cannot bypass RLS'
FROM pg_roles WHERE rolname = 'categoraize_app';

\echo == S10-G OAuth tokens are encrypted at rest (upstream format v<N>:<hex iv+tag+ciphertext>)
SELECT provider, count(*) AS accounts,
  count(*) FILTER (WHERE refresh_token IS NOT NULL) AS with_refresh,
  count(*) FILTER (WHERE refresh_token ~ '^v[0-9]+:[0-9a-f]{64,}$') AS refresh_encrypted,
  count(*) FILTER (WHERE access_token ~ '^v[0-9]+:[0-9a-f]{64,}$') AS access_encrypted,
  count(*) FILTER (WHERE refresh_token ~ '^(1//|M\.)' OR access_token ~ '^(ya29\.|Ew)') AS provider_plaintext
FROM "Account" GROUP BY provider ORDER BY provider;

SELECT CASE WHEN count(*) FILTER (WHERE refresh_token IS NOT NULL AND refresh_token !~ '^v[0-9]+:[0-9a-f]{64,}$') = 0
             AND count(*) FILTER (WHERE access_token IS NOT NULL AND access_token !~ '^v[0-9]+:[0-9a-f]{64,}$') = 0
            THEN 'PASS' ELSE 'FAIL' END
  || ' S10-G01 every stored OAuth access and refresh token is encrypted (' || count(*) || ' accounts)'
FROM "Account";

ROLLBACK;
