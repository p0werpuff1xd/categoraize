import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  resetMailboxTimezoneCache,
  resolveMailboxTimezone,
  toIanaTimezone,
} from "./mailbox-timezone";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email-account-client", () => ({
  getOutlookClientForEmail: vi.fn(),
}));

import { getOutlookClientForEmail } from "@/utils/email-account-client";

const logger = createTestLogger();

function mockOutlookTimezone(value: string | Error) {
  const get =
    value instanceof Error
      ? vi.fn().mockRejectedValue(value)
      : vi.fn().mockResolvedValue({ value });
  const api = vi.fn().mockReturnValue({ get });
  vi.mocked(getOutlookClientForEmail).mockResolvedValue({
    getClient: () => ({ api }),
  } as any);
  return api;
}

function mockAccount(timezone: string | null, provider = "microsoft") {
  prisma.emailAccount.findUnique.mockResolvedValue({
    timezone,
    userId: "user-1",
    account: { provider },
  } as any);
}

describe("toIanaTimezone", () => {
  it("maps Outlook (Windows) ids to IANA", () => {
    expect(toIanaTimezone("Singapore Standard Time")).toBe("Asia/Singapore");
    expect(toIanaTimezone("Pacific Standard Time")).toBe("America/Los_Angeles");
  });

  it("keeps IANA ids and rejects unknown values", () => {
    expect(toIanaTimezone("Asia/Manila")).toBe("Asia/Manila");
    expect(toIanaTimezone("Nowhere Standard Time")).toBeNull();
    expect(toIanaTimezone("")).toBeNull();
  });
});

describe("resolveMailboxTimezone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMailboxTimezoneCache();
    prisma.emailAccount.findFirst.mockResolvedValue(null);
    prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 } as any);
  });

  it("uses the mailbox's saved time zone", async () => {
    mockAccount("Asia/Manila");
    await expect(
      resolveMailboxTimezone({ emailAccountId: "ea-1", logger }),
    ).resolves.toBe("Asia/Manila");
    expect(getOutlookClientForEmail).not.toHaveBeenCalled();
  });

  it("reads and saves the Outlook mailbox time zone when none is saved", async () => {
    mockAccount(null);
    const api = mockOutlookTimezone("Singapore Standard Time");

    await expect(
      resolveMailboxTimezone({ emailAccountId: "ea-1", logger }),
    ).resolves.toBe("Asia/Singapore");
    expect(api).toHaveBeenCalledWith("/me/mailboxSettings/timeZone");
    expect(prisma.emailAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "ea-1", timezone: null },
      data: { timezone: "Asia/Singapore" },
    });
  });

  it("falls back to the user's other mailbox when Outlook cannot be read", async () => {
    mockAccount(null);
    mockOutlookTimezone(new Error("graph down"));
    prisma.emailAccount.findFirst.mockResolvedValue({
      timezone: "Asia/Manila",
    } as any);

    await expect(
      resolveMailboxTimezone({ emailAccountId: "ea-1", logger }),
    ).resolves.toBe("Asia/Manila");
    expect(prisma.emailAccount.updateMany).not.toHaveBeenCalled();
  });

  it("does not ask Graph for a Google mailbox, and ends at UTC", async () => {
    mockAccount(null, "google");
    await expect(
      resolveMailboxTimezone({ emailAccountId: "ea-1", logger }),
    ).resolves.toBe("UTC");
    expect(getOutlookClientForEmail).not.toHaveBeenCalled();
  });

  it("asks Graph only once per mailbox", async () => {
    mockAccount(null);
    const api = mockOutlookTimezone("Nowhere Standard Time");
    await resolveMailboxTimezone({ emailAccountId: "ea-1", logger });
    await resolveMailboxTimezone({ emailAccountId: "ea-1", logger });
    expect(api).toHaveBeenCalledTimes(1);
  });
});
