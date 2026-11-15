import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

/**
 * Stored classifications with everything the Priority Inbox row and detail
 * panel show: spans, read state, sender contact and whether a correction
 * taught the label. Shared by the triage list and search results.
 */
export async function loadTriageRows({
  emailAccountId,
  where,
  take,
}: {
  emailAccountId: string;
  where: Prisma.CategorizeClassificationWhereInput;
  take: number;
}) {
  const rows = await prisma.categorizeClassification.findMany({
    where: { ...where, emailAccountId },
    orderBy: [{ receivedAt: "desc" }],
    take,
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

  const [messages, contacts] = await Promise.all([
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
  ]);
  const readByMessageId = new Map(
    messages.map((message) => [message.messageId, message.read]),
  );
  const contactByEmail = new Map(
    contacts.map((contact) => [contact.email, contact]),
  );

  return rows.map(({ _count, ...row }) => ({
    ...row,
    corrected: _count.feedbackEvents > 0,
    priority: row.manualPriority ?? row.computedPriority,
    // Seeded demo mail has no Gmail message, so it counts as unread.
    read: readByMessageId.get(row.messageId) ?? false,
    sender: row.fromEmail ? (contactByEmail.get(row.fromEmail) ?? null) : null,
  }));
}

export type TriageRow = Awaited<ReturnType<typeof loadTriageRows>>[number];
