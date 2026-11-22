import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  clearCalendarBusyCache,
  getCalendarBusyForPriority,
} from "./calendar-busy";

vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/unified-availability", () => ({
  getUnifiedCalendarAvailability: vi.fn(),
}));

import { getUnifiedCalendarAvailability } from "@/utils/calendar/unified-availability";

const logger = createTestLogger();
const GOOGLE = { start: "2026-11-20T08:00:00Z", end: "2026-11-20T10:00:00Z" };
const OUTLOOK = { start: "2026-11-19T01:00:00Z", end: "2026-11-19T02:00:00Z" };

function call() {
  return getCalendarBusyForPriority({
    emailAccountId: "gmail-account",
    timezone: "Asia/Manila",
    logger,
  });
}

describe("getCalendarBusyForPriority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCalendarBusyCache();
    prisma.emailAccount.findUnique.mockResolvedValue({
      userId: "user-1",
    } as any);
  });

  it("returns null when the user has no connected calendar", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([]);
    await expect(call()).resolves.toBeNull();
    expect(getUnifiedCalendarAvailability).not.toHaveBeenCalled();
  });

  it("uses calendars connected under every mailbox of the user", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([
      { emailAccountId: "gmail-account" },
      { emailAccountId: "outlook-account" },
    ] as any);
    vi.mocked(getUnifiedCalendarAvailability).mockImplementation(
      async ({ emailAccountId }) =>
        emailAccountId === "gmail-account" ? [GOOGLE] : [OUTLOOK],
    );

    await expect(call()).resolves.toEqual([GOOGLE, OUTLOOK]);
    expect(prisma.calendarConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isConnected: true, emailAccount: { userId: "user-1" } },
      }),
    );
  });

  it("keeps the working calendar when another one fails", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([
      { emailAccountId: "gmail-account" },
      { emailAccountId: "outlook-account" },
    ] as any);
    vi.mocked(getUnifiedCalendarAvailability).mockImplementation(
      async ({ emailAccountId, failClosed }) => {
        if (emailAccountId === "outlook-account") {
          if (failClosed) throw new Error("token expired");
          return [];
        }
        return [GOOGLE];
      },
    );

    await expect(call()).resolves.toEqual([GOOGLE]);
  });

  it("returns null (neutral) when every calendar fails", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([
      { emailAccountId: "outlook-account" },
    ] as any);
    vi.mocked(getUnifiedCalendarAvailability).mockImplementation(
      async ({ failClosed }) => {
        if (failClosed) throw new Error("token expired");
        return [];
      },
    );

    await expect(call()).resolves.toBeNull();
  });

  it("serves a full result from cache but retries a partial one soon", async () => {
    vi.useFakeTimers();
    try {
      prisma.calendarConnection.findMany.mockResolvedValue([
        { emailAccountId: "gmail-account" },
      ] as any);
      vi.mocked(getUnifiedCalendarAvailability).mockResolvedValue([GOOGLE]);
      await call();
      vi.advanceTimersByTime(5 * 60 * 1000);
      await call();
      expect(getUnifiedCalendarAvailability).toHaveBeenCalledTimes(1);

      clearCalendarBusyCache();
      vi.mocked(getUnifiedCalendarAvailability).mockReset();
      vi.mocked(getUnifiedCalendarAvailability).mockImplementation(
        async ({ failClosed }) => {
          if (failClosed) throw new Error("one calendar failed");
          return [GOOGLE];
        },
      );
      await call();
      vi.advanceTimersByTime(2 * 60 * 1000);
      await call();
      // 2 calls (fail-closed + fail-open) per fetch, fetched twice.
      expect(getUnifiedCalendarAvailability).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
