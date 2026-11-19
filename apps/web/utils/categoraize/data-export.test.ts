import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
      "categorizeUserSettings",
      "categorizeSenderEmbedding",
      "categorizeSenderCategoryCentroid",
      "categorizeDeadlineAlert",
      "categorizeNotification",
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

describe("C12 data export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@example.invalid",
    } as never);
    prisma.emailAccount.findMany.mockResolvedValue([{ id: "a1" }] as never);
  });

  it("C12-10 covers every CategorAIze table in the schema (complete)", async () => {
    const schema = readFileSync(
      join(import.meta.dirname, "../../prisma/schema.prisma"),
      "utf8",
    );
    const models = [...schema.matchAll(/^model (Categorize\w+) \{/gm)].map(
      (match) => match[1].charAt(0).toLowerCase() + match[1].slice(1),
    );
    expect(models.length).toBeGreaterThanOrEqual(14);
    for (const model of models) {
      const delegate = (
        prisma as unknown as Record<
          string,
          { findMany: ReturnType<typeof vi.fn> }
        >
      )[model];
      delegate.findMany.mockResolvedValue([{ id: `${model}-row` }]);
    }
    await buildExport("u1");
    const missing = models.filter(
      (model) =>
        (
          prisma as unknown as Record<
            string,
            { findMany: ReturnType<typeof vi.fn> }
          >
        )[model].findMany.mock.calls.length === 0,
    );
    expect(missing).toEqual([]);
  });

  it("C12-11 is idempotent: two exports return the same data and write nothing", async () => {
    const first = await buildExport("u1");
    const second = await buildExport("u1");
    const { exportedAt: _a, ...firstData } = first;
    const { exportedAt: _b, ...secondData } = second;
    expect(secondData).toEqual(firstData);
    for (const write of [
      "create",
      "update",
      "delete",
      "upsert",
      "deleteMany",
      "updateMany",
    ] as const) {
      expect(prisma.categorizeClassification[write]).not.toHaveBeenCalled();
      expect(prisma.user[write]).not.toHaveBeenCalled();
    }
  });

  it("C12-12 leaves vectors and email excerpts out of the learning and deadline rows", async () => {
    await buildExport("u1");
    const embeddingArgs = JSON.stringify(
      prisma.categorizeSenderEmbedding.findMany.mock.calls[0]?.[0],
    );
    expect(embeddingArgs).not.toMatch(/embedding"/);
    expect(prisma.categorizeDeadlineAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ omit: { sourceText: true } }),
    );
  });
});
