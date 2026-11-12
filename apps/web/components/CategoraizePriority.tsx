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
};

/** Text label and color together, never color alone. */
export function PriorityBadge({
  level,
  manual,
  className,
}: {
  level: number;
  manual?: boolean;
  className?: string;
}) {
  const { label, color } = PRIORITY_LEVELS[level] ?? PRIORITY_LEVELS[3];
  return (
    <Badge color={color} className={cn("whitespace-nowrap", className)}>
      P{level} · {label}
      {manual ? " · manual" : ""}
    </Badge>
  );
}

export function priorityLabel(level: number) {
  return PRIORITY_LEVELS[level]?.label ?? "";
}

export function PriorityFactorBreakdown({
  factors,
  level,
  computedLevel,
}: {
  factors: CategoraizePriorityFactors;
  level: number;
  computedLevel?: number;
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

  return (
    <div className="space-y-1 text-sm">
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
        <span>Computed priority (clamped to 1-5)</span>
        <span className="font-mono">P{computedLevel ?? level}</span>
      </div>
      {computedLevel !== undefined && computedLevel !== level && (
        <div className="flex justify-between gap-4 font-medium">
          <span>Manual override</span>
          <span className="font-mono">P{level}</span>
        </div>
      )}
    </div>
  );
}
