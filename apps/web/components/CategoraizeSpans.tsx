import { Badge } from "@/components/Badge";
import { cn } from "@/utils";

type HighlightSpan = {
  label: "TASK" | "DATE";
  start: number;
  end: number;
};

/** Original text with TASK and DATE spans marked by both a color and a text tag. */
export function HighlightedText({
  text,
  spans,
  className,
}: {
  text: string;
  spans: HighlightSpan[];
  className?: string;
}) {
  const ordered = [...spans]
    .filter((span) => span.start >= 0 && span.end <= text.length)
    .sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const span of ordered) {
    if (span.start < cursor) continue;
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    parts.push(
      <mark
        key={`${span.label}-${span.start}`}
        className={cn(
          "rounded px-0.5",
          span.label === "TASK"
            ? "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100"
            : "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
        )}
      >
        {text.slice(span.start, span.end)}
        <sup className="ml-0.5 text-[10px] font-semibold">{span.label}</sup>
      </mark>,
    );
    cursor = span.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <p className={cn("whitespace-pre-wrap text-sm leading-6", className)}>
      {parts}
    </p>
  );
}

export function SpanLegend() {
  return (
    <div className="flex gap-2 text-xs text-muted-foreground">
      <span className="rounded bg-indigo-100 px-1 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100">
        TASK
      </span>
      <span className="rounded bg-green-100 px-1 text-green-900 dark:bg-green-900/40 dark:text-green-100">
        DATE
      </span>
    </div>
  );
}

export function DeadlineStatus({
  ambiguous,
  confirmed,
  isDeadline,
  resolvedAt,
}: {
  ambiguous: boolean;
  confirmed?: boolean;
  isDeadline: boolean;
  resolvedAt?: string | Date | null;
}) {
  const overdue =
    (confirmed || (isDeadline && !ambiguous)) &&
    resolvedAt &&
    new Date(resolvedAt).getTime() < Date.now();
  if (overdue) return <Badge color="red">Overdue</Badge>;
  if (confirmed) return <Badge color="green">Confirmed deadline</Badge>;
  if (ambiguous)
    return <Badge color="yellow">Needs review: confirm to count</Badge>;
  if (!isDeadline) return <Badge color="gray">Date, not a deadline</Badge>;
  return <Badge color="green">Deadline</Badge>;
}

/**
 * Pre-filled Google Calendar link (no calendar write permission needed): a
 * 30-minute event ending at the deadline, opened in a new tab for the user
 * to review and save.
 */
export function googleCalendarLink({
  title,
  deadline,
  details,
}: {
  title: string;
  deadline: string | Date;
  details?: string;
}) {
  const end = new Date(deadline);
  const start = new Date(end.getTime() - 30 * 60 * 1000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarTime(start)}/${toCalendarTime(end)}`,
    details: details ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function AddToCalendarLink({
  title,
  deadline,
  details,
}: {
  title: string;
  deadline: string | Date;
  details?: string;
}) {
  return (
    <a
      href={googleCalendarLink({ title, deadline, details })}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-indigo-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-indigo-300"
    >
      Add to Google Calendar
    </a>
  );
}

function toCalendarTime(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function formatDeadline(value: string | Date, timezone?: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
}
