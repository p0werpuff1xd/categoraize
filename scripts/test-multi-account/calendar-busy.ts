// T-CAL: read busy periods for the next 7 days from every connected calendar,
// per email account, through the fork's own code paths. Read-only: free/busy
// only, no event titles. A normal token refresh may update the stored tokens,
// exactly as the app does on any calendar read.
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";
import { getCalendarBusyForPriority } from "@/utils/categoraize/calendar-busy";
import { createGoogleAvailabilityProvider } from "@/utils/calendar/providers/google-availability";
import { createMicrosoftAvailabilityProvider } from "@/utils/calendar/providers/microsoft-availability";
import { fmtManila, header, listTestAccounts, run } from "./lib";

const logger = createScopedLogger("test-multi-account/calendar");
const DAY = 86_400_000;

/** The test event: next Friday 16:00-18:00 Asia/Manila (override with CATZ_TEST_WINDOW=startISO/endISO). */
function testWindow() {
  if (process.env.CATZ_TEST_WINDOW) {
    const [start, end] = process.env.CATZ_TEST_WINDOW.split("/");
    return { start: new Date(start), end: new Date(end) };
  }
  const manilaNow = new Date(Date.now() + 8 * 3_600_000); // UTC+8, no DST
  const daysToFri = (5 - manilaNow.getUTCDay() + 7) % 7 || 7;
  const fri = new Date(Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate() + daysToFri));
  const start = new Date(fri.getTime() + (16 - 8) * 3_600_000);
  return { start, end: new Date(start.getTime() + 2 * 3_600_000) };
}
export const WINDOW = testWindow();
const coversWindow = (busy: Array<{ start: string; end: string }>) =>
  busy.some((p) => new Date(p.start) <= WINDOW.start && new Date(p.end) >= WINDOW.end);

run(async () => {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * DAY);
  const all: Record<string, Array<{ start: string; end: string }>> = {};

  for (const a of await listTestAccounts()) {
    header(`[${a.provider}] ${a.masked} (timezone=${a.timezone ?? "NULL"})`);
    const conns = await prisma.calendarConnection.findMany({
      where: { emailAccountId: a.id, isConnected: true },
      select: {
        id: true,
        provider: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        calendars: { where: { isEnabled: true }, select: { calendarId: true } },
      },
    });
    if (!conns.length) console.log("no connected calendar");

    // Per provider, fail-closed, so an error is visible instead of an empty list.
    for (const c of conns) {
      const provider =
        c.provider === "microsoft"
          ? createMicrosoftAvailabilityProvider(logger)
          : createGoogleAvailabilityProvider(logger);
      const t0 = Date.now();
      try {
        const busy = await provider.fetchBusyPeriods({
          accessToken: c.accessToken,
          connectionId: c.id,
          refreshToken: c.refreshToken,
          expiresAt: c.expiresAt?.getTime() ?? null,
          emailAccountId: a.id,
          calendarIds: c.calendars.map((x) => x.calendarId),
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          failOnCalendarError: true,
        });
        console.log(
          `${c.provider}: OK ${busy.length} busy period(s) in ${Date.now() - t0} ms`,
        );
        // Real accounts: never print the owner's schedule, only whether the
        // CATZ-TEST event window is covered.
        console.log(`  covers CATZ-TEST window ${fmtManila(WINDOW.start)}..${fmtManila(WINDOW.end)}: ${coversWindow(busy) ? "yes" : "NO"}`);
        const bad = busy.filter(
          (p) => !/(Z|[+-]\d\d:\d\d)$/.test(p.start) || !/(Z|[+-]\d\d:\d\d)$/.test(p.end),
        );
        console.log(
          `  timezone-aware ISO strings: ${bad.length ? `NO (${bad.length} bad)` : "yes"}`,
        );
      } catch (error) {
        console.log(
          `${c.provider}: ERROR ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`,
        );
      }
    }

    const unified = await getUnifiedCalendarAvailability({
      emailAccountId: a.id,
      startDate: start,
      endDate: end,
      timezone: a.timezone ?? "UTC",
      logger,
      exactRange: true,
    });
    console.log(`unified (what the app merges): ${unified.length} period(s)`);
    const forPriority = await getCalendarBusyForPriority({
      emailAccountId: a.id,
      timezone: a.timezone ?? "UTC",
      logger,
    });
    console.log(
      `calendar_busy sent to NLP service: ${forPriority === null ? "null (no calendar => neutral)" : `${forPriority.length} period(s), keys=${[...new Set(forPriority.flatMap((p) => Object.keys(p)))].join(",") || "-"}`}`,
    );
    all[a.id] = forPriority ?? [];
  }

  header("Cross-account");
  const keys = Object.keys(all);
  if (keys.length === 2) {
    const [x, y] = keys.map((k) => new Set(all[k].map((p) => `${new Date(p.start).toISOString()}|${new Date(p.end).toISOString()}`)));
    const shared = [...x].filter((k) => y.has(k));
    console.log(
      `identical busy periods present in both accounts' feeds: ${shared.length} (times not printed)`,
    );
    console.log(
      `CATZ-TEST window covered in both feeds: ${keys.every((k) => coversWindow(all[k])) ? "yes" : "NO"}`,
    );
  }
});
