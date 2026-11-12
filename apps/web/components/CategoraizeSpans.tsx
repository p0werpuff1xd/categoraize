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
            ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100"
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
      <span className="rounded bg-blue-100 px-1 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100">
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
}: {
  ambiguous: boolean;
  confirmed?: boolean;
  isDeadline: boolean;
}) {
  if (confirmed) return <Badge color="green">Confirmed deadline</Badge>;
  if (!isDeadline) return <Badge color="gray">Date, not a deadline</Badge>;
  if (ambiguous)
    return <Badge color="yellow">Ambiguous: confirm to count</Badge>;
  return <Badge color="green">Deadline</Badge>;
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
