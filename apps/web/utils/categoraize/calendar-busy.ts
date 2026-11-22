import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

type Busy = Array<{ start: string; end: string }>;

const WINDOW_DAYS = 14;
const CACHE_MS = 10 * 60 * 1000;
// A partial result (one calendar failed) is retried soon instead of being
// served for the full cache period.
const PARTIAL_CACHE_MS = 60 * 1000;
const cache = new Map<string, { until: number; busy: Busy | null }>();

/**
 * Busy periods for the next two weeks from every calendar the user connected,
 * under any of their mailboxes (Google/Microsoft free/busy only: no event
 * titles), for the priority rules' calendar boost. A deadline only needs to
 * fall inside one busy period, so a meeting in two calendars counts once.
 *
 * Returns null when no calendar is connected or every fetch fails, so missing
 * calendar data never lowers priority. If one calendar fails, the others are
 * still used and the failure is logged.
 */
export async function getCalendarBusyForPriority({
  emailAccountId,
  timezone,
  logger,
}: {
  emailAccountId: string;
  timezone: string;
  logger: Logger;
}): Promise<Busy | null> {
  const owner = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { userId: true },
  });
  const cacheKey = owner?.userId ?? emailAccountId;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.until) return cached.busy;

  const connections = await prisma.calendarConnection.findMany({
    where: owner
      ? { isConnected: true, emailAccount: { userId: owner.userId } }
      : { isConnected: true, emailAccountId },
    select: { emailAccountId: true },
  });
  const accountIds = [...new Set(connections.map((c) => c.emailAccountId))];

  let busy: Busy | null = null;
  let partial = false;
  if (accountIds.length) {
    const start = new Date();
    const end = new Date(start.getTime() + WINDOW_DAYS * 86_400_000);
    const results = await Promise.all(
      accountIds.map((accountId) =>
        fetchAccountBusy({ accountId, start, end, timezone, logger }),
      ),
    );
    partial = results.some((r) => r.status !== "ok");
    const succeeded = results.filter((r) => r.status !== "failed");
    busy = succeeded.length ? succeeded.flatMap((r) => r.busy) : null;
    if (partial) {
      logger.warn(
        "Some calendars were unavailable; calendar boost uses the rest",
        {
          emailAccountId,
          calendarAccounts: accountIds.length,
          failedAccounts: results.filter((r) => r.status === "failed").length,
          partialAccounts: results.filter((r) => r.status === "partial").length,
        },
      );
    }
  }

  cache.set(cacheKey, {
    until: Date.now() + (partial ? PARTIAL_CACHE_MS : CACHE_MS),
    busy,
  });
  return busy;
}

async function fetchAccountBusy({
  accountId,
  start,
  end,
  timezone,
  logger,
}: {
  accountId: string;
  start: Date;
  end: Date;
  timezone: string;
  logger: Logger;
}): Promise<{ status: "ok" | "partial" | "failed"; busy: Busy }> {
  const request = {
    emailAccountId: accountId,
    startDate: start,
    endDate: end,
    timezone,
    logger,
    exactRange: true,
  };
  try {
    // Fail-closed first, so a broken calendar is noticed rather than read as
    // "free" (missing calendars are still skipped).
    const busy = await getUnifiedCalendarAvailability({
      ...request,
      failClosed: true,
    });
    return { status: "ok", busy };
  } catch (error) {
    logger.warn("Calendar busy periods unavailable for a mailbox", {
      calendarAccountId: accountId,
      error,
    });
  }
  try {
    // Fail-open: each provider that works still contributes.
    const busy = await getUnifiedCalendarAvailability(request);
    return { status: busy.length ? "partial" : "failed", busy };
  } catch {
    return { status: "failed", busy: [] };
  }
}

/** Test hook. */
export function clearCalendarBusyCache() {
  cache.clear();
}
