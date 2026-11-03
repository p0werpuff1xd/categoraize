import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const GET = withEmailAccount("categorai/task-sheet", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const [deadlines, actions] = await Promise.all([
    prisma.categorizeDeadlineAlert.findMany({
      where: {
        emailAccountId,
        status: { in: ["PENDING", "NOTIFIED"] },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 100,
      select: {
        id: true,
        threadId: true,
        messageId: true,
        title: true,
        description: true,
        sourceText: true,
        dueDate: true,
        timezone: true,
        confidence: true,
        needsReview: true,
        priority: true,
        status: true,
      },
    }),
    prisma.categorizeClassification.findMany({
      where: {
        emailAccountId,
        actionDirective: { not: null },
        isReviewedByUser: false,
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        threadId: true,
        messageId: true,
        categoryId: true,
        categoryName: true,
        actionDirective: true,
        priority: true,
        priorityScore: true,
        confidence: true,
      },
    }),
  ]);

  return NextResponse.json({ deadlines, actions });
});
