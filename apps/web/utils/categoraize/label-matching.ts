import "server-only";

import { getAccountBackground } from "@/utils/categoraize/vectors";

/**
 * Threshold on the mean-centred cosine scale. Tuned on the dev split
 * (fastapi_core/eval/tune_teach.py) and checked once on test: with every
 * label taught by 10 examples 0.54 accuracy (raw 0.43); with one label
 * taught it no longer pulls in most of the inbox (Work 31 vs raw 68 of 14).
 */
export const CENTRED_THRESHOLD = 0.05;

/**
 * How labels are matched for an account: mean-centred against the account's
 * own mail when it has enough of it, otherwise raw cosine with the labels'
 * stored thresholds (the original behaviour).
 */
export async function getLabelMatching(
  emailAccountId: string,
  labelThresholds: number[],
) {
  const background = await getAccountBackground(emailAccountId);
  const threshold = background
    ? CENTRED_THRESHOLD
    : labelThresholds.length
      ? Math.min(...labelThresholds)
      : undefined;
  return { background, threshold };
}
