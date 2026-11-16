// Shared helpers for the read-only multi-account tests. Never prints tokens.
import prisma from "@/utils/prisma";

export const TZ = "Asia/Manila";

export function maskEmail(email: string | null | undefined) {
  if (!email) return "-";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? "?"}`;
}

export type TestAccount = {
  id: string;
  provider: string;
  masked: string;
  timezone: string | null;
  userId: string;
};

/** Every email account with its mail provider (google / microsoft). */
export async function listAccounts(): Promise<TestAccount[]> {
  const rows = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      timezone: true,
      userId: true,
      account: { select: { provider: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    provider: r.account?.provider ?? "?",
    masked: maskEmail(r.email),
    timezone: r.timezone,
    userId: r.userId,
  }));
}

/**
 * Only the throwaway test accounts. CATZ_TEST_EMAILS (comma-separated) must
 * list them; every other connected mailbox (e.g. the owner's real Gmail) is
 * never touched. Exits if the list is missing or matches nothing.
 */
export async function listTestAccounts(): Promise<TestAccount[]> {
  const wanted = (process.env.CATZ_TEST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!wanted.length)
    throw new Error(
      "Set CATZ_TEST_EMAILS=<test-gmail>,<test-outlook> so no real mailbox is touched.",
    );
  const rows = await prisma.emailAccount.findMany({
    where: { email: { in: wanted, mode: "insensitive" } },
    select: { id: true },
  });
  const ids = new Set(rows.map((r) => r.id));
  const accounts = (await listAccounts()).filter((a) => ids.has(a.id));
  if (!accounts.length)
    throw new Error("None of CATZ_TEST_EMAILS is connected in the app yet.");
  return accounts;
}

export function fmtManila(iso: string | Date) {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function header(title: string) {
  console.log(`\n=== ${title} ===`);
}

export async function run(main: () => Promise<void>) {
  try {
    await main();
    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  }
}
