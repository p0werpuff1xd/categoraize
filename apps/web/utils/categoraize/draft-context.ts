import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import prisma from "@/utils/prisma";

const LANGUAGE_NOTES: Record<string, string> = {
  en: "English",
  tl: "Filipino (Tagalog); reply in Filipino unless the thread suggests otherwise",
  mixed: "Taglish (mixed English and Filipino); a Taglish reply fits",
};

/**
 * Language, requests and deadlines CategorAIze found in the newest email, for
 * the draft prompt. Only phrases already in the email are included (no other
 * mail, no stored profile data), so the external LLM receives nothing new.
 */
export async function getCategoraizeDraftContext({
  emailAccountId,
  messageId,
  timezone,
}: {
  emailAccountId: string;
  messageId: string;
  timezone: string | null;
}): Promise<string | null> {
  if (!isCategoraizeEnabled()) return null;

  const classification = await prisma.categorizeClassification.findFirst({
    where: { emailAccountId, messageId },
    orderBy: { updatedAt: "desc" },
    select: {
      detectedLang: true,
      spans: {
        where: { dismissedAt: null },
        orderBy: [{ source: "asc" }, { start: "asc" }],
        select: {
          label: true,
          text: true,
          resolvedAt: true,
          ambiguous: true,
          isDeadline: true,
          confirmed: true,
        },
      },
    },
  });
  if (!classification) return null;

  const lines: string[] = [];
  const language = LANGUAGE_NOTES[classification.detectedLang ?? ""];
  if (language) lines.push(`Language: ${language}.`);

  const tasks = classification.spans.filter(({ label }) => label === "TASK");
  if (tasks.length) {
    lines.push("Requests in the email:");
    for (const task of tasks) lines.push(`- "${task.text}"`);
  }

  const dates = classification.spans.filter(({ label }) => label === "DATE");
  if (dates.length) {
    lines.push("Dates in the email:");
    for (const date of dates) {
      const when = date.resolvedAt
        ? formatDate(date.resolvedAt, timezone)
        : "date unclear";
      lines.push(`- "${date.text}": ${when} (${dateKind(date)})`);
    }
  }

  return lines.length ? lines.join("\n") : null;
}

function dateKind(date: {
  confirmed: boolean;
  isDeadline: boolean;
  ambiguous: boolean;
}) {
  if (date.confirmed) return "deadline confirmed by the user";
  if (date.ambiguous) return "unclear date; do not commit to it";
  if (date.isDeadline) return "deadline";
  return "date, not a deadline";
}

function formatDate(value: Date, timezone: string | null) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "UTC",
    timeZoneName: "short",
  }).format(value);
}
