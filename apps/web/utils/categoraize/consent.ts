import type { Prisma } from "@/generated/prisma/client";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

// Bump when the Terms or Privacy Notice text changes: everyone is asked to
// accept again. Rows saved under older versions do not count as acceptance.
export const CATEGORAIZE_TERMS_VERSION = "2026-11-16-draft";
export const CATEGORAIZE_PRIVACY_VERSION = "2026-11-16-draft";

const currentVersions = {
  termsVersion: CATEGORAIZE_TERMS_VERSION,
  privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
} as const;

/**
 * The user's active consent: the newest row for the current document versions
 * that was not withdrawn. Withdrawing marks every row, so an older row can
 * never come back to life.
 */
export async function getActiveConsent(userId: string) {
  // Open an explicit transaction and call set_config before the query so RLS
  // sees the tenant, bypassing AsyncLocalStorage which does not propagate
  // reliably through Prisma extensions in RSC layouts.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return tx.categorizeUserConsent.findFirst({
      where: { userId, withdrawnAt: null, ...currentVersions },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        acceptedAt: true,
        externalLlmEnabled: true,
        termsVersion: true,
        privacyVersion: true,
      },
    });
  });
}

/**
 * FR-1.8: the Terms and Privacy Notice must be accepted before the app reads a
 * mailbox. With CategorAIze turned off the app behaves like the original and is
 * not gated.
 */
export function isConsentGateEnabled() {
  return isCategoraizeEnabled();
}

export async function hasAcceptedCurrentTerms(userId: string) {
  if (!isConsentGateEnabled()) return true;
  return Boolean(await getActiveConsent(userId));
}

/**
 * Filter for email accounts whose user accepted the current Terms ({} when
 * the gate is off). Background jobs have no tenant, so the user ids come from
 * an owner-run database function that bypasses row-level security and returns
 * ids only (migration 20261117120000).
 */
export async function acceptedTermsEmailAccountFilter(): Promise<Prisma.EmailAccountWhereInput> {
  if (!isConsentGateEnabled()) return {};
  const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT "categorize_users_with_accepted_terms" AS "userId"
    FROM "categorize_users_with_accepted_terms"(${CATEGORAIZE_TERMS_VERSION}, ${CATEGORAIZE_PRIVACY_VERSION})`;
  return { userId: { in: rows.map((row) => row.userId) } };
}

/** External-LLM processing is opt-in and off by default (FR-1.8). */
export async function hasExternalLlmConsent(userId: string): Promise<boolean> {
  const consent = await getActiveConsent(userId);
  return consent?.externalLlmEnabled ?? false;
}

export const EXTERNAL_LLM_OFF_MESSAGE =
  "AI drafts use an external AI provider, which is turned off for this account. Turn on external AI processing in Settings, or write the reply yourself.";

/**
 * Gate for features that stay on the external LLM (drafts, Reply Zero). With
 * CategorAIze turned off the app behaves like the original and is not gated.
 */
export async function assertExternalLlmAllowed(userId: string) {
  if (!(await isExternalLlmAllowed(userId))) {
    throw new SafeError(EXTERNAL_LLM_OFF_MESSAGE, 403);
  }
}

export async function isExternalLlmAllowed(userId: string) {
  if (!isCategoraizeEnabled()) return true;
  return hasExternalLlmConsent(userId);
}
