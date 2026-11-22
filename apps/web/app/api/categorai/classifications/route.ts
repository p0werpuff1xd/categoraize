import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import { getClassificationStats } from "@/utils/categoraize/classification-stats";
import { loadTriageRows } from "@/utils/categoraize/triage-rows";
import {
  compareTriage,
  countByPriority,
} from "@/utils/categoraize/triage-order";

export type CategoraizeClassificationsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "categorai/classifications",
  async (request) => {
    const params = request.nextUrl.searchParams;
    const minPriority = Number(params.get("minPriority") ?? 0);
    const limit = Math.min(Math.max(Number(params.get("limit") ?? 50), 1), 200);
    return NextResponse.json(
      await getData({
        emailAccountId: request.auth.emailAccountId,
        categoryId: params.get("categoryId"),
        minPriority: Number.isInteger(minPriority) ? minPriority : 0,
        limit,
      }),
    );
  },
);

async function getData({
  emailAccountId,
  categoryId,
  minPriority,
  limit,
}: {
  emailAccountId: string;
  categoryId: string | null;
  minPriority: number;
  limit: number;
}) {
  const where: Prisma.CategorizeClassificationWhereInput = {};
  if (categoryId === "uncategorized") where.categoryId = null;
  else if (categoryId) where.categoryId = categoryId;

  const [enriched, stats] = await Promise.all([
    loadTriageRows({ emailAccountId, where, take: 500 }),
    getClassificationStats(emailAccountId),
  ]);

  const counts = countByPriority(enriched);

  // Triage order: priority, then nearest validated deadline, then newest.
  const classifications = enriched
    .filter((row) => row.priority >= minPriority)
    .sort(compareTriage)
    .slice(0, limit);

  return {
    classifications,
    counts,
    total: stats.total,
    // Rows beyond the 500 most recent are not ranked or counted.
    truncated: stats.total > enriched.length,
    latestAnalyzedAt: stats.latestAnalyzedAt,
  };
}
