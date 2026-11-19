// Triage ordering and filtering, shared by the classifications API (Date
// values) and the inbox client (ISO strings from JSON).

export type PriorityFilter = "all" | "p4plus" | 1 | 2 | 3 | 4 | 5;

type DateLike = Date | string | null | undefined;

type Ranked = {
  priority: number;
  deadlineAt?: DateLike;
  receivedAt?: DateLike;
};

function time(value: DateLike) {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).getTime();
}

export function compareDeadlines(a: DateLike, b: DateLike) {
  const left = time(a);
  const right = time(b);
  if (left !== null && right !== null) return left - right;
  if (left !== null) return -1;
  if (right !== null) return 1;
  return 0;
}

/** Priority (high first), then nearest deadline (none last), then newest. */
export function compareTriage(a: Ranked, b: Ranked) {
  return (
    b.priority - a.priority ||
    compareDeadlines(a.deadlineAt, b.deadlineAt) ||
    (time(b.receivedAt) ?? 0) - (time(a.receivedAt) ?? 0)
  );
}

export function countByPriority(
  rows: Array<{ priority: number; read: boolean }>,
) {
  return [1, 2, 3, 4, 5].map((level) => {
    const atLevel = rows.filter((row) => row.priority === level);
    return {
      level,
      total: atLevel.length,
      unread: atLevel.filter((row) => !row.read).length,
    };
  });
}

/** The inbox's priority chips; chronological re-sorts newest first. */
export function filterTriage<T extends Ranked>(
  rows: T[],
  filter: PriorityFilter,
  chronological: boolean,
) {
  const filtered = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "p4plus") return row.priority >= 4;
    return row.priority === filter;
  });
  if (!chronological) return filtered;
  return [...filtered].sort(
    (a, b) => (time(b.receivedAt) ?? 0) - (time(a.receivedAt) ?? 0),
  );
}
