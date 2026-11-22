-- CreateTable
CREATE TABLE "CategorizeAuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "emailAccountId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CategorizeAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorizeAuditEvent_userId_createdAt_idx" ON "CategorizeAuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CategorizeAuditEvent_eventType_createdAt_idx" ON "CategorizeAuditEvent"("eventType", "createdAt");

-- Append-only: the application may insert events but never change or remove them.
CREATE OR REPLACE FUNCTION "categorize_audit_event_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CategorizeAuditEvent is append-only (% rejected)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CategorizeAuditEvent_no_update_delete"
  BEFORE UPDATE OR DELETE ON "CategorizeAuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "categorize_audit_event_append_only"();

CREATE TRIGGER "CategorizeAuditEvent_no_truncate"
  BEFORE TRUNCATE ON "CategorizeAuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "categorize_audit_event_append_only"();
