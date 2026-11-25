import "server-only";

import { categoryEmbeddingText } from "@/utils/categoraize/categories";
import { embedTexts } from "@/utils/categoraize/client";
import { reclassifyStoredEmail } from "@/utils/categoraize/process-email";
import {
  getCategoryVectors,
  getLabelExampleMean,
  resortUnreviewedEmails,
  setCategoryCentroid,
} from "@/utils/categoraize/vectors";
import type { Logger } from "@/utils/logger";

/**
 * Weight of a label's examples against its description in the centroid:
 * centroid = normalize(description + EXAMPLE_WEIGHT * mean(examples)).
 * The Rocchio beta tuned on the dev split (fastapi_core/config/tuned.json);
 * with examples this scored 0.77 test accuracy versus 0.19 description-only.
 */
export const EXAMPLE_WEIGHT = 4;

export function combineCentroid(
  description: number[],
  exampleMean: number[] | null,
): number[] {
  const combined = exampleMean
    ? description.map((value, index) => value + EXAMPLE_WEIGHT * exampleMean[index])
    : [...description];
  const norm = Math.sqrt(combined.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) return [...description];
  return combined.map((value) => value / norm);
}

/**
 * Rebuild every active label's centroid from its description and the emails
 * the user put in it (this account only). Returns each label's example count.
 */
export async function rebuildLabelCentroids(emailAccountId: string) {
  const labels = await getCategoryVectors(emailAccountId);
  const missing = labels.filter((label) => !label.original);
  const embedded = missing.length
    ? await embedTexts(missing.map((label) => categoryEmbeddingText(label)))
    : [];
  const descriptionById = new Map(
    missing.map((label, index) => [label.id, embedded[index]]),
  );

  const counts = new Map<string, number>();
  for (const label of labels) {
    const description = label.original ?? descriptionById.get(label.id);
    if (!description) continue;
    const { mean, count } = await getLabelExampleMean({
      categoryId: label.id,
      emailAccountId,
    });
    counts.set(label.id, count);
    await setCategoryCentroid({
      categoryId: label.id,
      emailAccountId,
      centroid: combineCentroid(description, count ? mean : null),
    });
  }
  return counts;
}

/**
 * After labels learned: re-sort the unreviewed emails against the new
 * centroids in the database, then fully re-score (priority, spans) the ones
 * whose label changed, newest first, up to a cap.
 */
export async function applyLearnedLabels({
  emailAccountId,
  logger,
  maxRescore,
}: {
  emailAccountId: string;
  logger: Logger;
  /** Emails whose label changed get a full re-score (priority, spans), up to this many. */
  maxRescore: number;
}) {
  await rebuildLabelCentroids(emailAccountId);
  const moved = await resortUnreviewedEmails(emailAccountId);
  let rescored = 0;
  for (const { id } of moved.slice(0, maxRescore)) {
    try {
      await reclassifyStoredEmail({ emailAccountId, classificationId: id, logger });
      rescored++;
    } catch (error) {
      logger.warn("Re-score after teaching a label failed", {
        classificationId: id,
        error,
      });
    }
  }
  return { moved: moved.length, rescored };
}
