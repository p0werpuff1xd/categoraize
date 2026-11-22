import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { revokeProviderTokens } from "./revoke-tokens";

vi.mock("@/utils/prisma");

const logger = createScopedLogger("revoke-tokens-test");

function setGrants({
  accounts = [],
  calendars = [],
  drives = [],
}: {
  accounts?: Array<{
    providerId: string;
    access_token: string | null;
    refresh_token: string | null;
  }>;
  calendars?: Array<{
    provider: string;
    accessToken: string | null;
    refreshToken: string | null;
  }>;
  drives?: Array<{
    provider: string;
    accessToken: string | null;
    refreshToken: string | null;
  }>;
}) {
  prisma.account.findMany.mockResolvedValue(accounts as never);
  prisma.calendarConnection.findMany.mockResolvedValue(calendars as never);
  prisma.driveConnection.findMany.mockResolvedValue(drives as never);
}

describe("revokeProviderTokens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes every Google grant with its refresh token and skips Microsoft", async () => {
    setGrants({
      accounts: [
        { providerId: "google", access_token: "ga", refresh_token: "gr" },
        { providerId: "microsoft", access_token: "ma", refresh_token: "mr" },
      ],
      calendars: [
        { provider: "google", accessToken: "ca", refreshToken: "cr" },
      ],
      drives: [{ provider: "google", accessToken: "da", refreshToken: null }],
    });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const summary = await revokeProviderTokens({
      userId: "u1",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(summary).toEqual({
      googleRevoked: 3,
      googleFailed: 0,
      microsoftNotRevocable: 1,
    });
    const sent = fetchImpl.mock.calls.map(
      (call) => (call as unknown as [string, RequestInit])[1].body,
    );
    expect(sent).toEqual(["token=gr", "token=cr", "token=da"]);
  });

  it("counts an already-revoked token (HTTP 400) as revoked", async () => {
    setGrants({
      accounts: [
        { providerId: "google", access_token: null, refresh_token: "x" },
      ],
    });
    const fetchImpl = vi.fn(async () => new Response(null, { status: 400 }));
    const summary = await revokeProviderTokens({
      userId: "u1",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(summary.googleRevoked).toBe(1);
  });

  it("never throws: network errors and 5xx are counted as failures", async () => {
    setGrants({
      accounts: [
        { providerId: "google", access_token: null, refresh_token: "a" },
        { providerId: "google", access_token: null, refresh_token: "b" },
      ],
    });
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const summary = await revokeProviderTokens({
      userId: "u1",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(summary).toEqual({
      googleRevoked: 0,
      googleFailed: 2,
      microsoftNotRevocable: 0,
    });
  });

  it("never throws when the token lookup fails, so deletion goes ahead", async () => {
    prisma.account.findMany.mockRejectedValue(new Error("db down"));
    prisma.calendarConnection.findMany.mockResolvedValue([] as never);
    prisma.driveConnection.findMany.mockResolvedValue([] as never);
    const summary = await revokeProviderTokens({ userId: "u1", logger });
    expect(summary).toMatchObject({ googleRevoked: 0, lookupFailed: true });
  });

  it("skips grants with no token", async () => {
    setGrants({
      accounts: [
        { providerId: "google", access_token: null, refresh_token: null },
      ],
    });
    const fetchImpl = vi.fn();
    const summary = await revokeProviderTokens({
      userId: "u1",
      logger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.googleRevoked).toBe(0);
  });
});
