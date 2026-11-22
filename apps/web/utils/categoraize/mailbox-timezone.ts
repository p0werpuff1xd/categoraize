import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

/**
 * Windows time-zone ids (what Outlook's mailbox settings usually return)
 * mapped to IANA ids, from CLDR windowsZones (territory 001).
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  "Dateline Standard Time": "Etc/GMT+12",
  "UTC-11": "Etc/GMT+11",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Alaskan Standard Time": "America/Anchorage",
  "Pacific Standard Time": "America/Los_Angeles",
  "Pacific Standard Time (Mexico)": "America/Tijuana",
  "US Mountain Standard Time": "America/Phoenix",
  "Mountain Standard Time": "America/Denver",
  "Central America Standard Time": "America/Guatemala",
  "Central Standard Time": "America/Chicago",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "Canada Central Standard Time": "America/Regina",
  "SA Pacific Standard Time": "America/Bogota",
  "Eastern Standard Time": "America/New_York",
  "US Eastern Standard Time": "America/Indiana/Indianapolis",
  "Atlantic Standard Time": "America/Halifax",
  "SA Western Standard Time": "America/La_Paz",
  "Newfoundland Standard Time": "America/St_Johns",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "SA Eastern Standard Time": "America/Cayenne",
  UTC: "Etc/UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "GTB Standard Time": "Europe/Bucharest",
  "E. Europe Standard Time": "Europe/Chisinau",
  "Egypt Standard Time": "Africa/Cairo",
  "FLE Standard Time": "Europe/Kiev",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Israel Standard Time": "Asia/Jerusalem",
  "Turkey Standard Time": "Europe/Istanbul",
  "Arab Standard Time": "Asia/Riyadh",
  "Russian Standard Time": "Europe/Moscow",
  "E. Africa Standard Time": "Africa/Nairobi",
  "Iran Standard Time": "Asia/Tehran",
  "Arabian Standard Time": "Asia/Dubai",
  "Afghanistan Standard Time": "Asia/Kabul",
  "Pakistan Standard Time": "Asia/Karachi",
  "India Standard Time": "Asia/Kolkata",
  "Sri Lanka Standard Time": "Asia/Colombo",
  "Nepal Standard Time": "Asia/Kathmandu",
  "Bangladesh Standard Time": "Asia/Dhaka",
  "Myanmar Standard Time": "Asia/Yangon",
  "SE Asia Standard Time": "Asia/Bangkok",
  "North Asia East Standard Time": "Asia/Irkutsk",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Taipei Standard Time": "Asia/Taipei",
  "W. Australia Standard Time": "Australia/Perth",
  "Ulaanbaatar Standard Time": "Asia/Ulaanbaatar",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "AUS Central Standard Time": "Australia/Darwin",
  "E. Australia Standard Time": "Australia/Brisbane",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "West Pacific Standard Time": "Pacific/Port_Moresby",
  "New Zealand Standard Time": "Pacific/Auckland",
};

export function isIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

/** An Outlook mailbox time zone (Windows or IANA id) as an IANA id, or null. */
export function toIanaTimezone(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (WINDOWS_TO_IANA[trimmed]) return WINDOWS_TO_IANA[trimmed];
  return isIanaTimezone(trimmed) ? trimmed : null;
}

// One Graph lookup per mailbox per process, even when it finds nothing.
const outlookLookupDone = new Set<string>();

/**
 * The time zone used to resolve dates like "Friday 5pm" for a mailbox.
 *
 * 1. The mailbox's saved time zone.
 * 2. Outlook mailboxes: the Outlook mailbox setting (Outlook calendars carry
 *    no time zone, so connecting one never fills it in). Saved once found.
 * 3. Another mailbox of the same user that has a time zone.
 * 4. UTC.
 */
export async function resolveMailboxTimezone({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<string> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      timezone: true,
      userId: true,
      account: { select: { provider: true } },
    },
  });
  if (!account) return "UTC";
  if (account.timezone) return account.timezone;

  if (
    isMicrosoftProvider(account.account?.provider) &&
    !outlookLookupDone.has(emailAccountId)
  ) {
    outlookLookupDone.add(emailAccountId);
    const fromOutlook = await fetchOutlookMailboxTimezone({
      emailAccountId,
      logger,
    });
    if (fromOutlook) {
      await prisma.emailAccount.updateMany({
        where: { id: emailAccountId, timezone: null },
        data: { timezone: fromOutlook },
      });
      logger.info("Set mailbox time zone from Outlook mailbox settings", {
        emailAccountId,
        timezone: fromOutlook,
      });
      return fromOutlook;
    }
  }

  const sibling = await prisma.emailAccount.findFirst({
    where: {
      userId: account.userId,
      id: { not: emailAccountId },
      timezone: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: { timezone: true },
  });
  if (sibling?.timezone) {
    logger.info("Mailbox has no time zone; using the user's other mailbox", {
      emailAccountId,
    });
    return sibling.timezone;
  }

  logger.warn("Mailbox has no time zone; dates are resolved in UTC", {
    emailAccountId,
  });
  return "UTC";
}

async function fetchOutlookMailboxTimezone({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  try {
    // Loaded lazily: the mail-client module graph is heavy, and scripts that
    // classify mail outside Next (seed, tests) never need it for Google.
    const { getOutlookClientForEmail } = await import(
      "@/utils/email-account-client"
    );
    const outlook = await getOutlookClientForEmail({ emailAccountId, logger });
    const settings: { value?: string } = await outlook
      .getClient()
      .api("/me/mailboxSettings/timeZone")
      .get();
    const timezone = toIanaTimezone(settings?.value);
    if (!timezone)
      logger.warn("Outlook mailbox time zone not recognised", {
        emailAccountId,
        timezone: settings?.value,
      });
    return timezone;
  } catch (error) {
    logger.warn("Could not read the Outlook mailbox time zone", {
      emailAccountId,
      error,
    });
    return null;
  }
}

/** Test hook. */
export function resetMailboxTimezoneCache() {
  outlookLookupDone.clear();
}
