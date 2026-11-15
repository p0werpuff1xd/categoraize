import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CategoraizeTaskSheetResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/task-sheet", async (request) =>
  NextResponse.json(await getData(request.auth.emailAccountId)),
);

const OVERDUE_DAYS_SHOWN = 14;

const emailSelect = {
  id: true,
  threadId: true,
  messageId: true,
  subject: true,
  fromEmail: true,
  fromName: true,
  categoryName: true,
  receivedAt: true,
  computedPriority: true,
  manualPriority: true,
} as const;

/**
 * Smart Task Sheet: requests found in email (TASK spans not marked done) and
 * deadlines (validated or confirmed DATE spans) from two weeks overdue onward.
 * "Done" dismisses the span; the email itself is untouched.
 */
async function getData(emailAccountId: string) {
  const overdueFrom = new Date(Date.now() - OVERDUE_DAYS_SHOWN * 86_400_000);
  const [tasks, deadlines] = await Promise.all([
    prisma.categorizeExtractedSpan.findMany({
      where: { emailAccountId, dismissedAt: null, label: "TASK" },
      orderBy: [{ classification: { receivedAt: "desc" } }, { start: "asc" }],
      take: 200,
      select: {
        id: true,
        text: true,
        classification: { select: emailSelect },
      },
    }),
    prisma.categorizeExtractedSpan.findMany({
      where: {
        emailAccountId,
        dismissedAt: null,
        label: "DATE",
        resolvedAt: { gte: overdueFrom },
        OR: [{ isDeadline: true }, { confirmed: true }],
      },
      orderBy: [{ resolvedAt: "asc" }],
      take: 100,
      select: {
        id: true,
        text: true,
        resolvedAt: true,
        ambiguous: true,
        confirmed: true,
        classification: { select: emailSelect },
      },
    }),
  ]);

  return { tasks, deadlines };
}
