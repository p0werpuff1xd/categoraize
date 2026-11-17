import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import prisma from "@/utils/prisma";

/**
 * IAS Phase 11 J: PII masking is a per-user setting, on by default (a
 * missing settings row means on). With CategorAIze turned off the app behaves
 * like the original and masks nothing extra.
 */
export async function isPiiMaskingEnabled(userId: string): Promise<boolean> {
  if (!isCategoraizeEnabled()) return false;
  const settings = await prisma.categorizeUserSettings.findUnique({
    where: { userId },
    select: { piiMaskingEnabled: true },
  });
  return settings?.piiMaskingEnabled ?? true;
}

/**
 * For external-LLM requests: the user's setting, or masking on (when
 * CategorAIze is on) if the caller does not know the user. Never throws; a
 * failed lookup also falls back to masking.
 */
export async function shouldMaskPiiForLlm(userId?: string): Promise<boolean> {
  if (!isCategoraizeEnabled()) return false;
  if (!userId) return true;
  try {
    return await isPiiMaskingEnabled(userId);
  } catch {
    return true;
  }
}

export async function isPiiMaskingEnabledForAccount(
  emailAccountId: string,
): Promise<boolean> {
  if (!isCategoraizeEnabled()) return false;
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      user: {
        select: { categorizeSettings: { select: { piiMaskingEnabled: true } } },
      },
    },
  });
  return account?.user.categorizeSettings?.piiMaskingEnabled ?? true;
}
