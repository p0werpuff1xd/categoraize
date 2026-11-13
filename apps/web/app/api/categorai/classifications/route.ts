import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getClassificationStats } from "@/utils/categoraize/classification-stats";

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
      bodyText: true,
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
      _count: { select: { feedbackEvents: true } },
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

  const [messages, contacts, stats] = await Promise.all([
    prisma.emailMessage.findMany({
      where: {
        emailAccountId,
        messageId: { in: rows.map((row) => row.messageId) },
      },
      select: { messageId: true, read: true },
    }),
    prisma.categorizeContact.findMany({
      where: {
        emailAccountId,
        email: {
          in: rows.flatMap((row) => (row.fromEmail ? [row.fromEmail] : [])),
        },
      },
      select: { email: true, role: true, isVip: true },
    }),
    getClassificationStats(emailAccountId),
  ]);
  const readByMessageId = new Map(
    messages.map((message) => [message.messageId, message.read]),
  );
  const contactByEmail = new Map(
    contacts.map((contact) => [contact.email, contact]),
  );

  const enriched = rows.map(({ _count, ...row }) => ({
    ...row,
    corrected: _count.feedbackEvents > 0,
    priority: row.manualPriority ?? row.computedPriority,
    // Seeded demo mail has no Gmail message, so it counts as unread.
    read: readByMessageId.get(row.messageId) ?? false,
    sender: row.fromEmail ? (contactByEmail.get(row.fromEmail) ?? null) : null,
  }));

  const counts = [1, 2, 3, 4, 5].map((level) => {
    const atLevel = enriched.filter((row) => row.priority === level);
    return {
      level,
      total: atLevel.length,
      unread: atLevel.filter((row) => !row.read).length,
    };
  });

  // Triage order: priority, then nearest validated deadline, then newest.
  const classifications = enriched
    .filter((row) => row.priority >= minPriority)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        compareDeadlines(a.deadlineAt, b.deadlineAt) ||
        (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0),
    )
    .slice(0, limit);

  return {
    classifications,
    counts,
    total: stats.total,
    // Rows beyond the 500 most recent are not ranked or counted.
    truncated: stats.total > rows.length,
    latestAnalyzedAt: stats.latestAnalyzedAt,
  };
}

function compareDeadlines(a: Date | null, b: Date | null) {
  if (a && b) return a.getTime() - b.getTime();
  if (a) return -1;
  if (b) return 1;
  return 0;
}
