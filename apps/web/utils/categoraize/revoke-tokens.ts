import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const REVOKE_TIMEOUT_MS = 5000;

export type RevokeSummary = {
  googleRevoked: number;
  googleFailed: number;
  /** Microsoft has no token-revocation endpoint for personal accounts. */
  microsoftNotRevocable: number;
  /** The token lookup itself failed; nothing could be revoked. */
  lookupFailed?: boolean;
};

/**
 * FR-2.4 / RA 10173 erasure: revokes the user's Google tokens (sign-in,
 * calendar and Drive) before their rows are deleted. Best effort: a failure
 * is logged and counted, never thrown, so deletion always goes ahead.
 * Microsoft tokens cannot be revoked by the app; they are deleted with the
 * account and expire on their own (access tokens within about an hour).
 */
export async function revokeProviderTokens({
  userId,
  logger,
  fetchImpl = fetch,
}: {
  userId: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}): Promise<RevokeSummary> {
  try {
    return await revokeAll({ userId, logger, fetchImpl });
  } catch (error) {
    // A lookup failure must never block the erasure itself.
    logger.error("Token revocation lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      googleRevoked: 0,
      googleFailed: 0,
      microsoftNotRevocable: 0,
      lookupFailed: true,
    };
  }
}

async function revokeAll({
  userId,
  logger,
  fetchImpl,
}: {
  userId: string;
  logger: Logger;
  fetchImpl: typeof fetch;
}): Promise<RevokeSummary> {
  const [accounts, calendars, drives] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: { providerId: true, access_token: true, refresh_token: true },
    }),
    prisma.calendarConnection.findMany({
      where: { emailAccount: { userId } },
      select: { provider: true, accessToken: true, refreshToken: true },
    }),
    prisma.driveConnection.findMany({
      where: { emailAccount: { userId } },
      select: { provider: true, accessToken: true, refreshToken: true },
    }),
  ]);

  const grants = [
    ...accounts.map((a) => ({
      provider: a.providerId,
      token: a.refresh_token ?? a.access_token,
    })),
    ...[...calendars, ...drives].map((c) => ({
      provider: c.provider,
      token: c.refreshToken ?? c.accessToken,
    })),
  ];

  const summary: RevokeSummary = {
    googleRevoked: 0,
    googleFailed: 0,
    microsoftNotRevocable: 0,
  };

  for (const grant of grants) {
    if (!grant.token) continue;
    if (grant.provider === "microsoft") {
      summary.microsoftNotRevocable += 1;
      continue;
    }
    if (grant.provider !== "google") continue;
    try {
      const response = await fetchImpl(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: grant.token }).toString(),
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
      // 400 invalid_token means it was already revoked or expired: done.
      if (response.ok || response.status === 400) summary.googleRevoked += 1;
      else summary.googleFailed += 1;
    } catch (error) {
      summary.googleFailed += 1;
      logger.warn("Google token revocation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Provider token revocation", summary);
  return summary;
}
