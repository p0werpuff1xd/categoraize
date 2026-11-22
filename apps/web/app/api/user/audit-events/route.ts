import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type AuditEventsResponse = Awaited<ReturnType<typeof getData>>;

/** The signed-in user's own security events, newest first (read-only). */
export const GET = withAuth("user/audit-events", async (request) =>
  NextResponse.json(await getData(request.auth.userId)),
);

async function getData(userId: string) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: { id: true, email: true },
  });
  const accountIds = accounts.map((account) => account.id);
  const emailById = new Map(accounts.map((a) => [a.id, a.email]));

  const events = await prisma.categorizeAuditEvent.findMany({
    where: {
      OR: [{ userId }, { emailAccountId: { in: accountIds } }],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      eventType: true,
      emailAccountId: true,
      metadata: true,
    },
  });

  return {
    events: events.map((event) => ({
      ...event,
      account: event.emailAccountId
        ? (emailById.get(event.emailAccountId) ?? null)
        : null,
    })),
  };
}
