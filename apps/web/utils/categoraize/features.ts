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
  | "summaries";

const FEATURE_SWITCHES: Record<CategoraizeFeature, () => boolean> = {
  ruleMatching: () => env.CATEGORAIZE_RULE_MATCHING,
  smartCategories: () => env.CATEGORAIZE_SMART_CATEGORIES,
  coldEmail: () => env.CATEGORAIZE_COLD_EMAIL,
  summaries: () => env.CATEGORAIZE_SUMMARIES,
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
