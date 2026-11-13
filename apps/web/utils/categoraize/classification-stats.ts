import prisma from "@/utils/prisma";

/** Total analyzed emails and when the newest one was analyzed (drives the new-mail pill). */
export async function getClassificationStats(emailAccountId: string) {
  const result = await prisma.categorizeClassification.aggregate({
    where: { emailAccountId },
    _count: { _all: true },
    _max: { createdAt: true },
  });
  return {
    total: result._count._all,
    latestAnalyzedAt: result._max.createdAt?.toISOString() ?? null,
  };
}
