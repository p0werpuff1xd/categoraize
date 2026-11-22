import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CategoraizeContactsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/contacts", async (request) =>
  NextResponse.json(await getData(request.auth.emailAccountId)),
);

/**
 * Senders seen in analyzed email, merged with saved contacts (role and VIP
 * feed the priority rules). Saved contacts come first, then by email count.
 */
async function getData(emailAccountId: string) {
  const [classifications, contacts] = await Promise.all([
    prisma.categorizeClassification.findMany({
      where: { emailAccountId, fromEmail: { not: null } },
      orderBy: { receivedAt: "desc" },
      take: 3000,
      select: { fromEmail: true, fromName: true, receivedAt: true },
    }),
    prisma.categorizeContact.findMany({
      where: { emailAccountId },
      select: { email: true, name: true, role: true, isVip: true },
    }),
  ]);

  const senders = new Map<
    string,
    { name: string | null; emails: number; lastReceivedAt: Date | null }
  >();
  for (const row of classifications) {
    const email = row.fromEmail?.toLowerCase();
    if (!email) continue;
    const current = senders.get(email);
    if (current) current.emails += 1;
    else
      senders.set(email, {
        name: row.fromName,
        emails: 1,
        lastReceivedAt: row.receivedAt,
      });
  }

  const savedByEmail = new Map(
    contacts.map((contact) => [contact.email.toLowerCase(), contact]),
  );
  const emails = new Set([...savedByEmail.keys(), ...senders.keys()]);

  const rows = [...emails].map((email) => {
    const saved = savedByEmail.get(email);
    const seen = senders.get(email);
    return {
      email,
      name: saved?.name ?? seen?.name ?? null,
      role: saved?.role ?? null,
      isVip: saved?.isVip ?? false,
      saved: Boolean(saved),
      emails: seen?.emails ?? 0,
      lastReceivedAt: seen?.lastReceivedAt ?? null,
    };
  });
  rows.sort(
    (a, b) =>
      Number(b.saved && (b.isVip || b.role)) -
        Number(a.saved && (a.isVip || a.role)) || b.emails - a.emails,
  );
  return { contacts: rows };
}
