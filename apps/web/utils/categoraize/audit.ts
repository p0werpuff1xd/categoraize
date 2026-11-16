import type { Prisma } from "@/generated/prisma/client";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("categoraize-audit");

/** Security events kept in the append-only CategorizeAuditEvent table (IAS Phase 7 B). */
export const AUDIT_EVENT_TYPES = [
  "login",
  "logout",
  "account_connected",
  "account_disconnected",
  "consent_accepted",
  "consent_withdrawn",
  "external_llm_toggled",
  "oauth_scope_changed",
  "export_requested",
  "data_deletion_requested",
  "data_deletion_completed",
  "backup_run",
  "restore_test",
  "nlp_auth_failure_count",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** Only IDs, enums, counts and flags. Never email content, tokens or IP addresses. */
export type AuditMetadata = Record<
  string,
  string | number | boolean | null | string[]
>;

// Keys that must never reach the audit log, even by accident.
const FORBIDDEN_KEY =
  /token|secret|password|^ip$|ip_?address|body|subject|snippet|content/i;

export function sanitizeAuditMetadata(
  metadata: AuditMetadata | undefined,
): AuditMetadata | undefined {
  if (!metadata) return;
  const clean: AuditMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEY.test(key)) continue;
    if (typeof value === "string" && value.length > 200) continue;
    clean[key] = value;
  }
  return Object.keys(clean).length ? clean : undefined;
}

/**
 * Records a security event. Never throws: an audit failure must not break
 * sign-in, settings or mail processing, so it is logged instead.
 */
export async function recordAuditEvent({
  eventType,
  userId,
  emailAccountId,
  metadata,
}: {
  eventType: AuditEventType;
  userId?: string | null;
  emailAccountId?: string | null;
  metadata?: AuditMetadata;
}) {
  try {
    const clean = sanitizeAuditMetadata(metadata);
    await prisma.categorizeAuditEvent.create({
      data: {
        eventType,
        userId: userId ?? null,
        emailAccountId: emailAccountId ?? null,
        ...(clean ? { metadata: clean as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (error) {
    logger.error("Failed to record audit event", { eventType, error });
  }
}
