// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  deadlineStateFromSpans,
  PriorityBadge,
  PriorityFactorBreakdown,
  priorityLabel,
} from "@/components/CategoraizePriority";

afterEach(cleanup);

const factors = {
  category_base: 3,
  deadline: 2,
  sender_role: 1,
  calendar: 0,
  vip_pin: 0,
};

describe("C11 priority badge", () => {
  it.each([
    [5, "P5 · Critical"],
    [4, "P4 · High"],
    [3, "P3 · Medium"],
    [2, "P2 · Low"],
    [1, "P1 · Minimal"],
  ])("C11-18 maps P%i to text and label", (level, text) => {
    render(<PriorityBadge level={level} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(priorityLabel(level)).toBe(text.split(" · ")[1]);
  });

  it("C11-19 marks a manual override and a VIP pin in text, not colour only", () => {
    render(<PriorityBadge level={4} manual />);
    expect(screen.getByText("P4 · High · manual")).toBeTruthy();
    cleanup();
    render(<PriorityBadge level={4} vipPinned />);
    expect(screen.getByText("P4 · High · VIP")).toBeTruthy();
  });

  it("C11-20 never renders blank: missing level and pending states have text", () => {
    render(<PriorityBadge level={null} />);
    expect(screen.getByText("Not yet analyzed")).toBeTruthy();
    cleanup();
    render(<PriorityBadge level={3} state="recalculating" />);
    expect(screen.getByText("P3 · Recalculating…")).toBeTruthy();
  });

  it("C11-21 shows the learned weights, label offset and guardrail when present", () => {
    render(
      <PriorityFactorBreakdown
        factors={{
          ...factors,
          learned: {
            level: 4,
            model_level: 3,
            category_offset: 1,
            rule_level: 5,
            why: [{ factor: "deadline proximity", contribution: 0.8 }],
            guardrails: ["vip_floor"],
          },
        }}
        level={4}
        computedLevel={4}
        deadlineState="validated"
      />,
    );
    expect(screen.getByText("Learned weights")).toBeTruthy();
    expect(screen.getByText("Model estimate")).toBeTruthy();
    expect(
      screen.getByText("VIP sender with a task: raised to at least P4"),
    ).toBeTruthy();
    expect(screen.getByText(/deadline proximity supported P3/)).toBeTruthy();
    expect(
      screen.getByText("Rule-based priority (clamped to 1-5)"),
    ).toBeTruthy();
  });

  it("C11-23 deadline state: confirmed or clear deadline validates, ambiguous needs review", () => {
    const date = (over: object) => ({
      label: "DATE",
      ambiguous: false,
      isDeadline: false,
      ...over,
    });
    expect(deadlineStateFromSpans([date({ isDeadline: true })])).toBe(
      "validated",
    );
    expect(
      deadlineStateFromSpans([date({ ambiguous: true, confirmed: true })]),
    ).toBe("validated");
    expect(
      deadlineStateFromSpans([date({ ambiguous: true, isDeadline: true })]),
    ).toBe("needs-review");
    expect(
      deadlineStateFromSpans([
        { label: "PERSON", ambiguous: true, isDeadline: false },
      ]),
    ).toBe("none");
    expect(deadlineStateFromSpans([])).toBe("none");
  });

  it("C11-22 rule-only breakdown keeps the original wording", () => {
    render(
      <PriorityFactorBreakdown
        factors={factors}
        level={5}
        computedLevel={5}
        deadlineState="validated"
      />,
    );
    expect(screen.queryByText("Learned weights")).toBeNull();
    expect(screen.getByText("Computed priority (clamped to 1-5)")).toBeTruthy();
  });
});
