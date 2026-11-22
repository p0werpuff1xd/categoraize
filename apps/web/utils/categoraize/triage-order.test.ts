import { describe, expect, it } from "vitest";
import { compareTriage, countByPriority, filterTriage } from "./triage-order";

const row = (
  id: string,
  priority: number,
  receivedAt: string,
  deadlineAt: string | null = null,
  read = false,
) => ({ id, priority, receivedAt, deadlineAt, read });

const rows = [
  row("a", 3, "2026-11-16T09:00:00Z"),
  row("b", 5, "2026-11-15T09:00:00Z"),
  row("c", 4, "2026-11-16T10:00:00Z", "2026-11-20T09:00:00Z"),
  row("d", 4, "2026-11-14T10:00:00Z", "2026-11-18T09:00:00Z"),
  row("e", 1, "2026-11-17T09:00:00Z", null, true),
  row("f", 4, "2026-11-17T10:00:00Z"),
];

describe("C11 priority filter and sort", () => {
  it("C11-01 sorts by priority, then nearest deadline, then newest", () => {
    expect([...rows].sort(compareTriage).map((r) => r.id)).toEqual([
      "b",
      "d",
      "c",
      "f",
      "a",
      "e",
    ]);
  });

  it("C11-02 puts emails without a deadline after those with one at the same level", () => {
    const sorted = [
      row("x", 4, "2026-11-17T00:00:00Z"),
      row("y", 4, "2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z"),
    ].sort(compareTriage);
    expect(sorted.map((r) => r.id)).toEqual(["y", "x"]);
  });

  it("C11-03 accepts Date objects (API) and ISO strings (client) alike", () => {
    const asDates = rows.map((r) => ({
      ...r,
      receivedAt: new Date(r.receivedAt),
      deadlineAt: r.deadlineAt ? new Date(r.deadlineAt) : null,
    }));
    expect([...asDates].sort(compareTriage).map((r) => r.id)).toEqual(
      [...rows].sort(compareTriage).map((r) => r.id),
    );
  });

  it("C11-04 'all' keeps every email in order", () => {
    expect(filterTriage(rows, "all", false)).toEqual(rows);
  });

  it("C11-05 'P4+' keeps P4 and P5 only", () => {
    expect(filterTriage(rows, "p4plus", false).map((r) => r.id)).toEqual([
      "b",
      "c",
      "d",
      "f",
    ]);
  });

  it.each([
    1, 2, 3, 4, 5,
  ] as const)("C11-06 a single level filter (P%i) keeps that level only", (level) => {
    const kept = filterTriage(rows, level, false);
    expect(kept.every((r) => r.priority === level)).toBe(true);
    expect(kept.length).toBe(rows.filter((r) => r.priority === level).length);
  });

  it("C11-07 chronological mode sorts newest first without mutating the input", () => {
    const copy = [...rows];
    expect(filterTriage(rows, "all", true).map((r) => r.id)).toEqual([
      "f",
      "e",
      "c",
      "a",
      "b",
      "d",
    ]);
    expect(rows).toEqual(copy);
  });

  it("C11-08 counts total and unread per level", () => {
    expect(countByPriority(rows)).toEqual([
      { level: 1, total: 1, unread: 0 },
      { level: 2, total: 0, unread: 0 },
      { level: 3, total: 1, unread: 1 },
      { level: 4, total: 3, unread: 3 },
      { level: 5, total: 1, unread: 1 },
    ]);
  });

  it("C11-09 an empty inbox filters and counts to nothing", () => {
    expect(filterTriage([], "p4plus", true)).toEqual([]);
    expect(countByPriority([]).every((c) => c.total === 0)).toBe(true);
  });
});
