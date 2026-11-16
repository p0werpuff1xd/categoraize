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
  return prisma.categorizeUserConsent.findFirst({
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

/** Prisma filter for users who accepted the current Terms (or {} when the gate is off). */
export function acceptedTermsUserFilter(): Prisma.UserWhereInput {
  if (!isConsentGateEnabled()) return {};
  return {
    categorizeConsents: { some: { withdrawnAt: null, ...currentVersions } },
  };
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
