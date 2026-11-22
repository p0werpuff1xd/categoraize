import { describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getPriorityProposals } from "./proposals";

vi.mock("@/utils/prisma");

type Log = {
  id: string;
  categoryId: string | null;
  sender: string;
  computedPriority: number;
  manualPriority: number | null;
};

function setup({
  logs,
  decisions = [],
  isVip = false,
}: {
  logs: Log[];
  decisions?: string[];
  isVip?: boolean;
}) {
  prisma.categorizePriorityOverrideLog.findMany.mockResolvedValue(
    logs as never,
  );
  prisma.categorizeProposalDecision.findMany.mockResolvedValue(
    decisions.map((key) => ({ key })) as never,
  );
  prisma.categorizeCategory.findMany.mockResolvedValue([
    { id: "school", name: "School", basePriority: 3 },
  ] as never);
  prisma.categorizeContact.findMany.mockResolvedValue([
    { email: "prof@uni.edu", isVip },
  ] as never);
}

// Newest first, as the query returns them.
function overrides(direction: "up" | "down", sender = "prof@uni.edu") {
  return [3, 2, 1].map((n) => ({
    id: `log-${n}`,
    categoryId: "school",
    sender,
    computedPriority: 3,
    manualPriority: direction === "up" ? 5 : 1,
  }));
}

describe("getPriorityProposals", () => {
  it("suggests raising a label after three overrides upward in a row", async () => {
    setup({ logs: overrides("up", "a@x.com") });
    const proposals = await getPriorityProposals("account");
    expect(proposals).toContainEqual(
      expect.objectContaining({
        kind: "category_base",
        from: 3,
        to: 4,
        direction: "up",
      }),
    );
  });

  it("does not suggest anything when the overrides disagree", async () => {
    const logs = overrides("up");
    logs[1] = { ...logs[1], manualPriority: 1 };
    setup({ logs });
    expect(await getPriorityProposals("account")).toEqual([]);
  });

  it("suggests VIP for a sender raised three times, and removing VIP when lowered", async () => {
    setup({ logs: overrides("up") });
    expect(await getPriorityProposals("account")).toContainEqual(
      expect.objectContaining({ kind: "sender_vip", makeVip: true }),
    );
    setup({ logs: overrides("down"), isVip: true });
    expect(await getPriorityProposals("account")).toContainEqual(
      expect.objectContaining({ kind: "sender_vip", makeVip: false }),
    );
  });

  it("does not repeat a suggestion the user already answered", async () => {
    setup({
      logs: overrides("up"),
      decisions: ["category:school:log-3", "sender:prof@uni.edu:log-3"],
    });
    expect(await getPriorityProposals("account")).toEqual([]);
  });
});
