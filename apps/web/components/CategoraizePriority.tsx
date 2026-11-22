import { Badge, type Color } from "@/components/Badge";
import { cn } from "@/utils";

const PRIORITY_LEVELS: Record<number, { label: string; color: Color }> = {
  5: { label: "Critical", color: "red" },
  4: { label: "High", color: "orange" },
  3: { label: "Medium", color: "yellow" },
  2: { label: "Low", color: "blue" },
  1: { label: "Minimal", color: "gray" },
};

export type CategoraizePriorityFactors = {
  category_base: number;
  deadline: number;
  sender_role: number;
  calendar: number;
  vip_pin: number;
  /** Present when the NLP service scored the email with its learned model. */
  learned?: {
    level: number;
    model_level: number;
    category_offset: number;
    rule_level: number;
    why: Array<{ factor: string; contribution: number }>;
    guardrails: string[];
  };
};

const GUARDRAIL_TEXT: Record<string, string> = {
  vip_floor: "VIP sender with a task: raised to at least P4",
  promotion_cap: "Promotional label: capped at P2",
  manual_override: "Set by hand",
};

const PENDING_STATES = {
  "not-analyzed": "Not yet analyzed",
  analyzing: "Analyzing…",
  recalculating: "Recalculating…",
  unavailable: "Priority unavailable",
} as const;

/** Text label and color together, never color alone, and never blank. */
export function PriorityBadge({
  level,
  manual,
  vipPinned,
  state,
  className,
}: {
  level?: number | null;
  manual?: boolean;
  vipPinned?: boolean;
  state?: keyof typeof PENDING_STATES;
  className?: string;
}) {
  if (state || !level) {
    const text = PENDING_STATES[state ?? "not-analyzed"];
    const busy = state === "analyzing" || state === "recalculating";
    return (
      <Badge
        color="gray"
        className={cn("whitespace-nowrap", busy && "animate-pulse", className)}
      >
        {busy && level ? `P${level} · ${text}` : text}
      </Badge>
    );
  }

  const { label, color } = PRIORITY_LEVELS[level] ?? PRIORITY_LEVELS[3];
  return (
    <Badge color={color} className={cn("whitespace-nowrap", className)}>
      P{level} · {label}
      {manual ? " · manual" : vipPinned ? " · VIP" : ""}
    </Badge>
  );
}

export function priorityLabel(level: number) {
  return PRIORITY_LEVELS[level]?.label ?? "";
}

export type DeadlineState = "validated" | "needs-review" | "none";

export function PriorityFactorBreakdown({
  factors,
  level,
  computedLevel,
  deadlineState,
  calendarConnected = false,
}: {
  factors: CategoraizePriorityFactors;
  level: number;
  computedLevel?: number;
  deadlineState: DeadlineState;
  calendarConnected?: boolean;
}) {
  const rows = [
    {
      name: "Category base priority",
      value: factors.category_base,
      base: true,
    },
    {
      name: "Deadline (+2 within 24 h or overdue, +1 within 72 h)",
      value: factors.deadline,
    },
    {
      name: "Sender role (Director/Executive +2, Manager +1)",
      value: factors.sender_role,
    },
    { name: "Calendar conflict", value: factors.calendar },
    { name: "VIP sender (raised to at least P4)", value: factors.vip_pin },
  ];

  const learned = factors.learned;

  return (
    <div className="space-y-1 text-sm">
      {learned && (
        <div className="space-y-1 pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Learned weights
          </p>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Model estimate</span>
            <span className="font-mono">P{learned.model_level}</span>
          </div>
          {learned.category_offset !== 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                Your label's base priority
              </span>
              <span className="font-mono font-semibold">
                {learned.category_offset > 0 ? "+" : ""}
                {learned.category_offset}
              </span>
            </div>
          )}
          {learned.guardrails.map((rule) => (
            <div key={rule} className="text-muted-foreground">
              {GUARDRAIL_TEXT[rule] ?? rule}
            </div>
          ))}
          {learned.why.length > 0 && (
            <ul className="space-y-0.5 pl-4 text-xs text-muted-foreground">
              {learned.why.map((reason) => (
                <li key={reason.factor} className="list-disc">
                  {reason.factor}{" "}
                  {reason.contribution >= 0
                    ? `supported P${learned.model_level}`
                    : `argued against P${learned.model_level}`}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between gap-4 border-t pt-1 font-medium">
            <span>Learned priority</span>
            <span className="font-mono">P{learned.level}</span>
          </div>
          <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rule check (P{learned.rule_level})
          </p>
        </div>
      )}
      {rows.map((row) => (
        <div key={row.name} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{row.name}</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              !row.base && row.value > 0 && "font-semibold text-foreground",
            )}
          >
            {row.base ? row.value : `+${row.value}`}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1 font-medium">
        <span>
          {learned
            ? "Rule-based priority (clamped to 1-5)"
            : "Computed priority (clamped to 1-5)"}
        </span>
        <span className="font-mono">
          P{learned ? learned.rule_level : (computedLevel ?? level)}
        </span>
      </div>
      {computedLevel !== undefined && computedLevel !== level && (
        <div className="flex justify-between gap-4 font-medium">
          <span>Manual override</span>
          <span className="font-mono">P{level}</span>
        </div>
      )}
      <ul className="list-disc space-y-0.5 pl-4 pt-1 text-xs text-muted-foreground">
        {deadlineState === "none" && (
          <li>No validated deadline, so there is no deadline boost.</li>
        )}
        {deadlineState === "needs-review" && (
          <li>
            A date needs review. It counts toward priority only after you
            confirm it as a deadline.
          </li>
        )}
        <li>
          {calendarNote(calendarConnected, factors.calendar, deadlineState)}
        </li>
      </ul>
    </div>
  );
}

function calendarNote(
  connected: boolean,
  calendarBoost: number,
  deadlineState: DeadlineState,
) {
  if (!connected) {
    return "Calendar is not connected, so there is no calendar boost. Missing calendar data never lowers priority.";
  }
  if (calendarBoost > 0) {
    return "The deadline falls during an event on your calendar (+1).";
  }
  if (deadlineState === "validated") {
    return "No calendar event overlaps the deadline (calendar checked for the next 14 days).";
  }
  return "Calendar is connected; it adds +1 only when a validated deadline falls during a busy time.";
}

/** Deadline wording for the breakdown, from the stored spans. */
export function deadlineStateFromSpans(
  spans: Array<{
    label: string;
    ambiguous: boolean;
    isDeadline: boolean;
    confirmed?: boolean;
  }>,
): DeadlineState {
  const dates = spans.filter((span) => span.label === "DATE");
  if (
    dates.some((span) => span.confirmed || (span.isDeadline && !span.ambiguous))
  ) {
    return "validated";
  }
  if (dates.some((span) => span.ambiguous)) return "needs-review";
  return "none";
}
