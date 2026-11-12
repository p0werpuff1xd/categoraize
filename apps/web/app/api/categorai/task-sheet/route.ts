import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CategoraizeTaskSheetResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/task-sheet", async (request) =>
  NextResponse.json(await getData(request.auth.emailAccountId)),
);

async function getData(emailAccountId: string) {
  const spans = await prisma.categorizeExtractedSpan.findMany({
    where: {
      emailAccountId,
      dismissedAt: null,
      OR: [{ label: "TASK" }, { label: "DATE", isDeadline: true }],
    },
    orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      label: true,
      text: true,
      resolvedAt: true,
      ambiguous: true,
      confirmed: true,
      classification: {
        select: {
          id: true,
          threadId: true,
          messageId: true,
          subject: true,
          fromEmail: true,
          computedPriority: true,
          manualPriority: true,
        },
      },
    },
  });

  return {
    tasks: spans.filter((span) => span.label === "TASK"),
    deadlines: spans.filter((span) => span.label === "DATE"),
  };
}
