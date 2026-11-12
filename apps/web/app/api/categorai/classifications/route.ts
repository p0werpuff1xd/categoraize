import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

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
  const where: Prisma.CategorizeClassificationWhereInput = { emailAccountId };
  if (categoryId === "uncategorized") where.categoryId = null;
  else if (categoryId) where.categoryId = categoryId;

  const rows = await prisma.categorizeClassification.findMany({
    where,
    orderBy: [{ receivedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      threadId: true,
      messageId: true,
      subject: true,
      fromEmail: true,
      fromName: true,
      snippet: true,
      receivedAt: true,
      categoryId: true,
      categoryName: true,
      confidence: true,
      rankedCategories: true,
      suggestedLabel: true,
      computedPriority: true,
      manualPriority: true,
      priorityFactors: true,
      deadlineAt: true,
      detectedLang: true,
      isReviewedByUser: true,
      spans: {
        where: { dismissedAt: null },
        orderBy: [{ source: "asc" }, { start: "asc" }],
        select: {
          id: true,
          label: true,
          text: true,
          source: true,
          start: true,
          end: true,
          resolvedAt: true,
          ambiguous: true,
          isDeadline: true,
          confirmed: true,
        },
      },
    },
  });

  // Triage order: priority, then nearest validated deadline, then newest.
  const classifications = rows
    .map((row) => ({
      ...row,
      priority: row.manualPriority ?? row.computedPriority,
    }))
    .filter((row) => row.priority >= minPriority)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        compareDeadlines(a.deadlineAt, b.deadlineAt) ||
        (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0),
    )
    .slice(0, limit);

  return { classifications };
}

function compareDeadlines(a: Date | null, b: Date | null) {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}
