import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const priorityValues = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

export const GET = withEmailAccount(
  "categorai/classifications",
  async (request) => {
    const params = request.nextUrl.searchParams;
    const priority = params.get("priority");
    const categoryId = params.get("categoryId");
    const reviewed = params.get("reviewed");
    const limit = Math.min(Math.max(Number(params.get("limit") ?? 50), 1), 100);
    const offset = Math.max(Number(params.get("offset") ?? 0), 0);

    const classifications = await prisma.categorizeClassification.findMany({
      where: {
        emailAccountId: request.auth.emailAccountId,
        ...(priority &&
        priorityValues.includes(priority as (typeof priorityValues)[number])
          ? { priority: priority as (typeof priorityValues)[number] }
          : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(reviewed === "true" || reviewed === "false"
          ? { isReviewedByUser: reviewed === "true" }
          : {}),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        threadId: true,
        messageId: true,
        categoryId: true,
        categoryName: true,
        confidence: true,
        priority: true,
        priorityBand: true,
        priorityScore: true,
        urgency: true,
        importance: true,
        rawPriorityScore: true,
        deadlineFactor: true,
        senderFactor: true,
        calendarFactor: true,
        priorityDampener: true,
        priorityOverride: true,
        detectedLang: true,
        actionDirective: true,
        summary: true,
        isReviewedByUser: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ classifications, limit, offset });
  },
);
