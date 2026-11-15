import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const WINDOW_DAYS = 14;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<
  string,
  { at: number; busy: Array<{ start: string; end: string }> | null }
>();

/**
 * Busy periods for the next two weeks from the account's connected calendars
 * (Google/Microsoft free/busy only: no event titles), for the priority rules'
 * calendar boost. Returns null when no calendar is connected or the fetch
 * fails, so missing calendar data never lowers priority.
 */
export async function getCalendarBusyForPriority({
  emailAccountId,
  timezone,
  logger,
}: {
  emailAccountId: string;
  timezone: string;
  logger: Logger;
}): Promise<Array<{ start: string; end: string }> | null> {
  const cached = cache.get(emailAccountId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.busy;

  const connected = await prisma.calendarConnection.count({
    where: { emailAccountId, isConnected: true },
  });
  let busy: Array<{ start: string; end: string }> | null = null;
  if (connected) {
    try {
      const start = new Date();
      const end = new Date(start.getTime() + WINDOW_DAYS * 86_400_000);
      busy = await getUnifiedCalendarAvailability({
        emailAccountId,
        startDate: start,
        endDate: end,
        timezone,
        logger,
        exactRange: true,
      });
    } catch (error) {
      logger.warn("Calendar busy periods unavailable; no calendar boost", {
        error,
      });
      busy = null;
    }
  }
  cache.set(emailAccountId, { at: Date.now(), busy });
  return busy;
}
