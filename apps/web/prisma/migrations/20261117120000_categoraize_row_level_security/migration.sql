-- IAS Phase 11 K: row-level security on CategorAIze-owned tables only.
-- Original Inbox Zero tables are not touched.
--
-- The app sets the tenant per transaction:
--   SELECT set_config('app.current_user_id', '<user id>', true);
-- (utils/categoraize/tenant.ts). Without it every policy matches nothing,
-- so a missing context returns no rows and rejects writes (fail closed).
-- Superusers bypass RLS by design; the app must connect as a role without
-- BYPASSRLS (scripts/db/create-app-role.ps1 creates categoraize_app).

CREATE OR REPLACE FUNCTION "categorize_current_user_id"() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_user_id', true), '') $$;

-- Tables scoped by email account: a row is visible and writable only when its
-- email account belongs to the current user.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
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
    'CategorizeSenderEmbedding'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "categorize_tenant" ON %I
         USING ("emailAccountId" IN (SELECT "id" FROM "EmailAccount" WHERE "userId" = "categorize_current_user_id"()))
         WITH CHECK ("emailAccountId" IN (SELECT "id" FROM "EmailAccount" WHERE "userId" = "categorize_current_user_id"()))',
      t);
  END LOOP;
END $$;

-- Tables scoped by user.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['CategorizeUserConsent', 'CategorizeUserSettings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "categorize_tenant" ON %I
         USING ("userId" = "categorize_current_user_id"())
         WITH CHECK ("userId" = "categorize_current_user_id"())',
      t);
  END LOOP;
END $$;

-- Audit log: users read only their own events; any server code may append
-- (system events such as NLP key failures have no user). UPDATE and DELETE
-- have no policy, and the append-only trigger rejects them anyway.
ALTER TABLE "CategorizeAuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategorizeAuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "categorize_audit_read" ON "CategorizeAuditEvent" FOR SELECT
  USING (
    "userId" = "categorize_current_user_id"()
    OR "emailAccountId" IN (SELECT "id" FROM "EmailAccount" WHERE "userId" = "categorize_current_user_id"())
  );
CREATE POLICY "categorize_audit_append" ON "CategorizeAuditEvent" FOR INSERT
  WITH CHECK (true);

-- Background jobs (mailbox watch renewal) must know which users accepted the
-- current Terms without a tenant. This owner-run function returns only those
-- user ids; it does not expose any consent row to the app role.
CREATE OR REPLACE FUNCTION "categorize_users_with_accepted_terms"(p_terms text, p_privacy text)
  RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
  AS $$
    SELECT DISTINCT "userId" FROM "CategorizeUserConsent"
    WHERE "withdrawnAt" IS NULL AND "termsVersion" = p_terms AND "privacyVersion" = p_privacy
  $$;
REVOKE ALL ON FUNCTION "categorize_users_with_accepted_terms"(text, text) FROM PUBLIC;
