import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  CATEGORAIZE_PRIVACY_VERSION,
  CATEGORAIZE_TERMS_VERSION,
  acceptedTermsEmailAccountFilter,
  getActiveConsent,
  hasAcceptedCurrentTerms,
} from "./consent";

vi.mock("@/utils/prisma");

const mocks = vi.hoisted(() => ({ enabled: true }));

vi.mock("@/utils/categoraize/client", () => ({
  isCategoraizeEnabled: () => mocks.enabled,
}));

type Row = {
  id: string;
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  withdrawnAt: Date | null;
  createdAt: Date;
  acceptedAt: Date;
  externalLlmEnabled: boolean;
};

// Minimal in-memory findFirst that honours the where clause getActiveConsent builds.
function useRows(rows: Row[]) {
  prisma.categorizeUserConsent.findFirst.mockImplementation((async (args: {
    where: Partial<Row>;
  }) => {
    const where = args.where;
    const match = rows
      .filter((row) =>
        Object.entries(where).every(
          ([key, value]) => row[key as keyof Row] === value,
        ),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return match[0] ?? null;
  }) as never);
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "c1",
    userId: "user_1",
    termsVersion: CATEGORAIZE_TERMS_VERSION,
    privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
    withdrawnAt: null,
    createdAt: new Date("2026-11-16T00:00:00Z"),
    acceptedAt: new Date("2026-11-16T00:00:00Z"),
    externalLlmEnabled: false,
    ...overrides,
  };
}

describe("consent gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = true;
  });

  it("is open when CategorAIze is turned off", async () => {
    mocks.enabled = false;
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(true);
    expect(await acceptedTermsEmailAccountFilter()).toEqual({});
    expect(prisma.categorizeUserConsent.findFirst).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("accepts a current, non-withdrawn row", async () => {
    useRows([row()]);
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(true);
  });

  it("rejects a user with no rows", async () => {
    useRows([]);
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(false);
  });

  it("does not count a withdrawn row", async () => {
    useRows([row({ withdrawnAt: new Date("2026-11-16T01:00:00Z") })]);
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(false);
  });

  it("does not count rows for an older Terms or Privacy version", async () => {
    useRows([
      row({ id: "old-terms", termsVersion: "2026-01-01" }),
      row({ id: "old-privacy", privacyVersion: "2026-01-01" }),
    ]);
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(false);
  });

  it("does not count another user's consent", async () => {
    useRows([row({ userId: "user_2" })]);
    expect(await hasAcceptedCurrentTerms("user_1")).toBe(false);
  });

  it("queries with the current versions and withdrawnAt null", async () => {
    useRows([row()]);
    await getActiveConsent("user_1");
    expect(prisma.categorizeUserConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user_1",
          withdrawnAt: null,
          termsVersion: CATEGORAIZE_TERMS_VERSION,
          privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
        },
      }),
    );
  });

  it("limits email accounts to users with a current consent from the owner-run lookup", async () => {
    prisma.$queryRaw.mockResolvedValue([
      { userId: "user_1" },
      { userId: "user_2" },
    ] as never);
    expect(await acceptedTermsEmailAccountFilter()).toEqual({
      userId: { in: ["user_1", "user_2"] },
    });
    expect(prisma.$queryRaw.mock.calls[0].slice(1)).toEqual([
      CATEGORAIZE_TERMS_VERSION,
      CATEGORAIZE_PRIVACY_VERSION,
    ]);
  });
});
