import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { buildExport } from "./data-export";

vi.mock("@/utils/prisma");

describe("buildExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: "a1" },
      { id: "a2" },
    ] as never);
    for (const model of [
      "categorizeCategory",
      "categorizeClassification",
      "categorizeExtractedSpan",
      "categorizeContact",
      "categorizeFeedbackEvent",
      "categorizePriorityOverrideLog",
      "categorizeProposalDecision",
      "categorizeUserConsent",
      "categorizeAuditEvent",
    ] as const) {
      (prisma[model].findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        [],
      );
    }
  });

  it("only reads the user's own accounts", async () => {
    await buildExport("u1");
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } }),
    );
    expect(prisma.categorizeCategory.findMany).toHaveBeenCalledWith({
      where: { emailAccountId: { in: ["a1", "a2"] } },
    });
    expect(prisma.categorizeUserConsent.findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
    });
  });

  it("leaves email bodies out of classifications", async () => {
    await buildExport("u1");
    expect(prisma.categorizeClassification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { bodyText: true, snippet: true } }),
    );
  });

  it("never selects tokens from the account rows", async () => {
    await buildExport("u1");
    const selects = [
      prisma.user.findUnique.mock.calls[0]?.[0],
      prisma.emailAccount.findMany.mock.calls[0]?.[0],
    ].map((args) => JSON.stringify(args));
    for (const select of selects) {
      expect(select).not.toMatch(/token|secret|aiApiKey/i);
    }
  });
});
