import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { reclassifyStoredEmail } from "@/utils/categoraize/process-email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const MAX_RESCORE = 100;

/**
 * Re-score stored emails after a change that affects priority (a label's base
 * priority, a sender's role or VIP status), newest first. Returns how many
 * were re-scored; 0 when the service is turned off.
 */
export async function rescoreClassifications({
  emailAccountId,
  where,
  logger,
}: {
  emailAccountId: string;
  where: Prisma.CategorizeClassificationWhereInput;
  logger: Logger;
}) {
  if (!isCategoraizeEnabled()) return 0;
  const rows = await prisma.categorizeClassification.findMany({
    where: { ...where, emailAccountId, bodyText: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: MAX_RESCORE,
    select: { id: true },
  });
  for (const { id } of rows) {
    await reclassifyStoredEmail({
      emailAccountId,
      classificationId: id,
      logger,
    });
  }
  return rows.length;
}
