import { env } from "@/env";
import {
  CategoraizeServiceError,
  isCategoraizeEnabled,
} from "@/utils/categoraize/client";
import { hasExternalLlmConsent } from "@/utils/categoraize/consent";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

export type CategoraizeFeature =
  | "ruleMatching"
  | "smartCategories"
  | "coldEmail"
  | "summaries"
  | "replyStatus";

const FEATURE_SWITCHES: Record<CategoraizeFeature, () => boolean> = {
  ruleMatching: () => env.CATEGORAIZE_RULE_MATCHING,
  smartCategories: () => env.CATEGORAIZE_SMART_CATEGORIES,
  coldEmail: () => env.CATEGORAIZE_COLD_EMAIL,
  summaries: () => env.CATEGORAIZE_SUMMARIES,
  replyStatus: () => env.CATEGORAIZE_REPLY_STATUS,
};

export function isCategoraizeFeatureOn(feature: CategoraizeFeature) {
  return isCategoraizeEnabled() && FEATURE_SWITCHES[feature]();
}

/**
 * Runs a feature on the CategorAIze service when its switch is on, otherwise
 * on the original LLM path. If the service fails, the LLM path is used only
 * for users who opted in to external-LLM processing; everyone else gets an
 * error instead of having their email sent to an external provider.
 */
/**
 * Local first, external LLM only when CategorAIze is unsure (the cascade).
 *
 * - Feature switch off: the original LLM path, as before.
 * - Local answer confident: used; nothing leaves the machine.
 * - Local answer unsure: the external LLM decides, but only for users who
 *   opted in to external AI. If the LLM fails, or the user did not opt in,
 *   the local best guess is used.
 * - Service down: same as runCategoraizeOrLlm (LLM only with consent).
 */
export async function runCategoraizeCascade<T>({
  feature,
  userId,
  logger,
  local,
  llm,
}: {
  feature: CategoraizeFeature;
  userId: string;
  logger: Logger;
  local: () => Promise<{ result: T; confident: boolean }>;
  llm: (localResult: T | null) => Promise<T>;
}): Promise<T> {
  if (!isCategoraizeFeatureOn(feature)) return llm(null);

  const decision = await runCategoraizeOrLlm<{
    result: T;
    confident: boolean;
    fromLlm?: boolean;
  }>({
    feature,
    userId,
    logger,
    categoraize: local,
    llm: async () => ({
      result: await llm(null),
      confident: true,
      fromLlm: true,
    }),
  });
  if (decision.confident || decision.fromLlm) return decision.result;

  if (!(await hasExternalLlmConsent(userId))) {
    logger.info("CategorAIze unsure; external AI is off, using local answer", {
      feature,
    });
    return decision.result;
  }

  try {
    logger.info("CategorAIze unsure; asking the external AI", { feature });
    return await llm(decision.result);
  } catch (error) {
    logger.warn("External AI failed; using the local answer", {
      feature,
      error,
    });
    return decision.result;
  }
}

export async function runCategoraizeOrLlm<T>({
  feature,
  userId,
  logger,
  categoraize,
  llm,
}: {
  feature: CategoraizeFeature;
  userId: string;
  logger: Logger;
  categoraize: () => Promise<T>;
  llm: () => Promise<T>;
}): Promise<T> {
  if (!isCategoraizeFeatureOn(feature)) return llm();

  try {
    return await categoraize();
  } catch (error) {
    if (!(error instanceof CategoraizeServiceError)) throw error;

    if (await hasExternalLlmConsent(userId)) {
      logger.warn("CategorAIze service failed; using the LLM fallback", {
        feature,
        status: error.status,
      });
      return llm();
    }

    logger.warn("CategorAIze service failed; no LLM fallback without consent", {
      feature,
      status: error.status,
    });
    throw new SafeError(
      "Smart sorting is unavailable right now, and external AI processing is turned off for this account. It will retry later.",
      503,
    );
  }
}
