// T-FAIL: one broken calendar must not stop the other, and must stay neutral.
// The broken side uses FAKE tokens and a FAKE emailAccountId, so the app's
// "mark connection disconnected" helper matches no row and nothing real is
// changed. The healthy side is the real test account(s), read-only, counts only.
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createGoogleAvailabilityProvider } from "@/utils/calendar/providers/google-availability";
import { createMicrosoftAvailabilityProvider } from "@/utils/calendar/providers/microsoft-availability";
import { header, listTestAccounts, run } from "./lib";

const logger = createScopedLogger("test-multi-account/failure");
const FAKE = {
  accessToken: "catz-fake-access",
  refreshToken: "catz-fake-refresh",
  expiresAt: Date.now() - 60_000, // expired -> forces a refresh, which fails
  emailAccountId: "catz-fake-account",
  calendarIds: ["primary"],
};

run(async () => {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const broken = [
    ["google (fake token)", createGoogleAvailabilityProvider(logger)],
    ["microsoft (fake token)", createMicrosoftAvailabilityProvider(logger)],
  ] as const;

  const healthy = [];
  for (const a of await listTestAccounts()) {
    const conns = await prisma.calendarConnection.findMany({
      where: { emailAccountId: a.id, isConnected: true },
      select: { id: true, provider: true, accessToken: true, refreshToken: true, expiresAt: true,
        calendars: { where: { isEnabled: true }, select: { calendarId: true } } },
    });
    for (const c of conns) healthy.push({ a, c });
  }

  for (const failClosed of [false, true]) {
    header(`failOnCalendarError=${failClosed} (app's CategorAIze path uses false)`);
    const jobs = [
      ...broken.map(([name, p]) => ({
        name,
        promise: p.fetchBusyPeriods({ ...FAKE, timeMin, timeMax, failOnCalendarError: failClosed }),
      })),
      ...healthy.map(({ a, c }) => ({
        name: `${c.provider} real (${a.masked})`,
        promise: (c.provider === "microsoft"
          ? createMicrosoftAvailabilityProvider(logger)
          : createGoogleAvailabilityProvider(logger)
        ).fetchBusyPeriods({
          accessToken: c.accessToken, connectionId: c.id, refreshToken: c.refreshToken,
          expiresAt: c.expiresAt?.getTime() ?? null, emailAccountId: a.id,
          calendarIds: c.calendars.map((x) => x.calendarId), timeMin, timeMax,
          failOnCalendarError: false,
        }),
      })),
    ];
    const settled = await Promise.allSettled(jobs.map((j) => j.promise));
    settled.forEach((s, i) =>
      console.log(
        `  ${jobs[i].name.padEnd(34)} ${s.status === "fulfilled" ? `ok, ${s.value.length} period(s)` : `rejected: ${String((s.reason as Error)?.message ?? s.reason).slice(0, 120)}`}`,
      ),
    );
  }

  header("Safety: no real connection was marked disconnected");
  const disconnected = await prisma.calendarConnection.count({ where: { isConnected: false } });
  console.log(`  calendar connections with isConnected=false: ${disconnected}`);
});
