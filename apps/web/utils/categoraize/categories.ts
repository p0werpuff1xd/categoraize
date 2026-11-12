import "server-only";

import type { Logger } from "@/utils/logger";
import { embedTexts, isCategoraizeEnabled } from "@/utils/categoraize/client";
import { setCategoryDescriptionEmbedding } from "@/utils/categoraize/vectors";

/**
 * Embed a category's name and description through the NLP service. If the
 * service is down the category still works: /classify embeds descriptions
 * that have no stored vector.
 */
export async function embedCategoryDescription({
  emailAccountId,
  category,
  resetCentroid,
  logger,
}: {
  emailAccountId: string;
  category: { id: string; name: string; description: string | null };
  resetCentroid: boolean;
  logger: Logger;
}) {
  if (!isCategoraizeEnabled()) return false;

  try {
    const [embedding] = await embedTexts([categoryEmbeddingText(category)]);
    await setCategoryDescriptionEmbedding({
      categoryId: category.id,
      emailAccountId,
      embedding,
      resetCentroid,
    });
    return true;
  } catch (error) {
    logger.warn("CategorAIze category embedding failed", {
      categoryId: category.id,
      error,
    });
    return false;
  }
}

// Must match the service's fallback text for categories without a centroid.
export function categoryEmbeddingText(category: {
  name: string;
  description: string | null;
}) {
  return category.description
    ? `${category.name}: ${category.description}`
    : category.name;
}
