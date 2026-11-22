import prisma from "@/utils/prisma";

/** The user's CategorAIze data for "Download my data": no tokens, secrets or email bodies. */
export async function buildExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: { id: true, email: true, timezone: true, createdAt: true },
  });
  const accountIds = accounts.map((account) => account.id);
  const byAccount = { emailAccountId: { in: accountIds } };

  const [
    categories,
    classifications,
    spans,
    contacts,
    feedback,
    priorityOverrides,
    proposalDecisions,
    consents,
    auditEvents,
  ] = await Promise.all([
    prisma.categorizeCategory.findMany({ where: byAccount }),
    prisma.categorizeClassification.findMany({
      where: byAccount,
      omit: { bodyText: true, snippet: true },
    }),
    prisma.categorizeExtractedSpan.findMany({ where: byAccount }),
    prisma.categorizeContact.findMany({ where: byAccount }),
    prisma.categorizeFeedbackEvent.findMany({ where: byAccount }),
    prisma.categorizePriorityOverrideLog.findMany({ where: byAccount }),
    prisma.categorizeProposalDecision.findMany({ where: byAccount }),
    prisma.categorizeUserConsent.findMany({ where: { userId } }),
    prisma.categorizeAuditEvent.findMany({
      where: { OR: [{ userId }, { emailAccountId: { in: accountIds } }] },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    notes:
      "Your CategorAIze data. Access tokens, secrets and the raw text of your emails are not included. Email content stays in your Gmail or Outlook mailbox.",
    user,
    emailAccounts: accounts,
    categories,
    classifications,
    extractedSpans: spans,
    contacts,
    feedback,
    priorityOverrides,
    proposalDecisions,
    consents,
    auditEvents,
  };
}
