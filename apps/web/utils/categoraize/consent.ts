import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

// Bump when the Terms or Privacy Notice text changes (Phase 8 pages).
export const CATEGORAIZE_TERMS_VERSION = "2026-11-draft";
export const CATEGORAIZE_PRIVACY_VERSION = "2026-11-draft";

/** The user's active consent row: the newest one that was not withdrawn. */
export async function getActiveConsent(userId: string) {
  const latest = await prisma.categorizeUserConsent.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      acceptedAt: true,
      externalLlmEnabled: true,
      withdrawnAt: true,
      termsVersion: true,
      privacyVersion: true,
    },
  });
  return latest && !latest.withdrawnAt ? latest : null;
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
