-- IAS Phase 11 K follow-up: the runtime role categoraize_app has no BYPASSRLS.
-- On Supabase, row-level security is enabled on every public table (to keep
-- the anon/authenticated API roles out), but only CategorAIze tables have
-- tenant policies. Without a policy, categoraize_app would see no rows in
-- User, Account, EmailAccount and every other upstream table.
--
-- Give categoraize_app full access to every non-CategorAIze table: the same
-- access the owner role had through BYPASSRLS. CategorAIze tables keep their
-- per-tenant policies; the API roles stay locked out. Skipped when the role
-- does not exist (fresh databases create it with scripts/db/create-app-role.ps1).
DO $$
DECLARE t record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'categoraize_app') THEN
    RAISE NOTICE 'categoraize_app does not exist; no policies created';
    RETURN;
  END IF;
  FOR t IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname NOT LIKE 'Categorize%'
      AND c.relname <> '_prisma_migrations'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.relname AND policyname = 'categoraize_app_full_access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY categoraize_app_full_access ON public.%I TO categoraize_app USING (true) WITH CHECK (true)',
        t.relname
      );
    END IF;
  END LOOP;
END $$;
