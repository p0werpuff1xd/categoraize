// T-INV: what is connected, per email account. Read-only; no tokens printed.
import prisma from "@/utils/prisma";
import { header, listAccounts, maskEmail, run } from "./lib";

run(async () => {
  const accounts = await listAccounts();
  header(`Email accounts (${accounts.length})`);
  for (const a of accounts) {
    const [cals, drives, cats, cls, catz, centroids, overrides, contacts] =
      await Promise.all([
        prisma.calendarConnection.findMany({
          where: { emailAccountId: a.id },
          select: {
            provider: true,
            email: true,
            isConnected: true,
            expiresAt: true,
            calendars: { select: { isEnabled: true, primary: true } },
          },
        }),
        prisma.driveConnection.findMany({
          where: { emailAccountId: a.id },
          select: { provider: true, isConnected: true },
        }),
        prisma.categorizeCategory.count({ where: { emailAccountId: a.id } }),
        prisma.categorizeClassification.count({
          where: { emailAccountId: a.id },
        }),
        prisma.categorizeClassification.findMany({
          where: { emailAccountId: a.id, subject: { startsWith: "CATZ-TEST" } },
          select: {
            subject: true,
            processingStatus: true,
            categoryName: true,
            priorityBand: true,
          },
        }),
        prisma.categorizeSenderCategoryCentroid.count({
          where: { emailAccountId: a.id },
        }),
        prisma.categorizePriorityOverrideLog.count({
          where: { emailAccountId: a.id },
        }),
        prisma.categorizeContact.count({ where: { emailAccountId: a.id } }),
      ]);
    const emailAcc = await prisma.emailAccount.findUnique({
      where: { id: a.id },
      select: { filingEnabled: true },
    });
    console.log(
      `\n[${a.provider}] ${a.masked} id=${a.id} user=${a.userId} timezone=${a.timezone ?? "NULL"} filingEnabled=${emailAcc?.filingEnabled}`,
    );
    console.log(
      `  categories=${cats} classifications=${cls} senderCentroids=${centroids} overrides=${overrides} contacts=${contacts}`,
    );
    for (const c of cals)
      console.log(
        `  calendar ${c.provider} ${maskEmail(c.email)} connected=${c.isConnected} tokenExpires=${c.expiresAt?.toISOString() ?? "-"} calendars=${c.calendars.length} enabled=${c.calendars.filter((x) => x.isEnabled).length}`,
      );
    if (!cals.length) console.log("  calendar: none");
    for (const d of drives)
      console.log(`  drive ${d.provider} connected=${d.isConnected}`);
    if (!drives.length) console.log("  drive: none");
    for (const m of catz)
      console.log(
        `  CATZ ${m.subject} -> status=${m.processingStatus} category=${m.categoryName ?? "-"} band=${m.priorityBand}`,
      );
    if (!catz.length) console.log("  CATZ-TEST classifications: none stored");
  }

  header("Consent (per user)");
  const users = [...new Set(accounts.map((a) => a.userId))];
  for (const userId of users) {
    const latest = await prisma.categorizeUserConsent.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { externalLlmEnabled: true, withdrawnAt: true },
    });
    console.log(
      `user=${userId} accounts=${accounts.filter((a) => a.userId === userId).length} externalLlm=${latest?.externalLlmEnabled ?? "no consent row"} withdrawn=${!!latest?.withdrawnAt}`,
    );
  }
});
