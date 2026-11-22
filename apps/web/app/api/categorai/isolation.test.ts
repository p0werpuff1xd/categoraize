/**
 * IAS Phase 7 D: tenant isolation for CategorAIze API routes.
 *
 * Signed in as user A (owner of acc-a), a request carrying B's account ID
 * (acc-b) must be refused with 403 before any CategorAIze table is queried,
 * and a request for acc-a must only ever query rows scoped to acc-a.
 * User-level routes (consent, security log) must only read the session user.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-a", email: "a@example.com" },
  })),
}));
vi.mock("@/utils/redis/account-validation", () => ({
  // Same contract as the real helper: the account's email only when the
  // account belongs to the user, otherwise null.
  getEmailAccount: vi.fn(
    async ({
      userId,
      emailAccountId,
    }: {
      userId: string;
      emailAccountId: string;
    }) => {
      const owners: Record<string, string> = {
        "acc-a": "user-a",
        "acc-b": "user-b",
      };
      return owners[emailAccountId] === userId
        ? `${emailAccountId}@example.com`
        : null;
    },
  ),
}));
vi.mock("@/utils/categoraize/client", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/categoraize/client")>()),
  isCategoraizeEnabled: () => true,
  getCategoraizeHealth: vi.fn(async () => "ready"),
  embedTexts: vi.fn(async () => [new Array(384).fill(0)]),
}));

import { GET as getCategories } from "@/app/api/categorai/categories/route";
import { GET as getClassifications } from "@/app/api/categorai/classifications/route";
import { GET as getLatestClassifications } from "@/app/api/categorai/classifications/latest/route";
import { GET as getContacts } from "@/app/api/categorai/contacts/route";
import { GET as getProposals } from "@/app/api/categorai/proposals/route";
import { POST as postSearch } from "@/app/api/categorai/search/route";
import { GET as getStatus } from "@/app/api/categorai/status/route";
import { GET as getSuggestedLabels } from "@/app/api/categorai/suggested-labels/route";
import { GET as getTaskSheet } from "@/app/api/categorai/task-sheet/route";
import { GET as getAuditEvents } from "@/app/api/user/audit-events/route";
import { GET as getConsent } from "@/app/api/user/categoraize-consent/route";

type Handler = (req: NextRequest, ctx: unknown) => Promise<Response>;

const ROUTES: [string, Handler, "GET" | "POST"][] = [
  ["categorai/categories", getCategories as Handler, "GET"],
  ["categorai/classifications", getClassifications as Handler, "GET"],
  [
    "categorai/classifications/latest",
    getLatestClassifications as Handler,
    "GET",
  ],
  ["categorai/contacts", getContacts as Handler, "GET"],
  ["categorai/proposals", getProposals as Handler, "GET"],
  ["categorai/search", postSearch as Handler, "POST"],
  ["categorai/status", getStatus as Handler, "GET"],
  ["categorai/suggested-labels", getSuggestedLabels as Handler, "GET"],
  ["categorai/task-sheet", getTaskSheet as Handler, "GET"],
];

const CATEGORIZE_MODELS = [
  "categorizeCategory",
  "categorizeClassification",
  "categorizeContact",
  "categorizeExtractedSpan",
  "categorizeFeedbackEvent",
  "categorizePriorityOverrideLog",
  "categorizeProposalDecision",
  "categorizeUserConsent",
  "categorizeAuditEvent",
] as const;
const METHODS = [
  "findFirst",
  "findMany",
  "findUnique",
  "count",
  "groupBy",
  "aggregate",
] as const;

type AnyMock = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (v: unknown) => void;
};
const models = prisma as unknown as Record<string, Record<string, AnyMock>>;

function categorizeCalls() {
  const calls = CATEGORIZE_MODELS.flatMap((model) =>
    METHODS.flatMap((method) =>
      models[model][method].mock.calls.map((args) => ({
        model,
        method,
        args: args[0],
      })),
    ),
  );
  const raw = [
    ...prisma.$queryRaw.mock.calls,
    ...prisma.$queryRawUnsafe.mock.calls,
  ].map((args) => ({ model: "$queryRaw", method: "raw", args }));
  return [...calls, ...raw];
}

function request(path: string, method: "GET" | "POST", emailAccountId: string) {
  return new NextRequest(`http://localhost/api/${path}`, {
    method,
    headers: {
      [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      "content-type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify({ query: "exam" }) } : {}),
  });
}

const ctx = { params: Promise.resolve({}) };

describe("CategorAIze API routes: tenant isolation", () => {
  beforeEach(() => {
    for (const model of CATEGORIZE_MODELS) {
      models[model].findMany.mockResolvedValue([]);
      models[model].count.mockResolvedValue(0);
      models[model].groupBy.mockResolvedValue([]);
    }
    prisma.$queryRaw.mockResolvedValue([] as never);
  });

  describe.each(ROUTES)("%s", (path, handler, method) => {
    it("returns 403 for another user's email account and reads nothing", async () => {
      const response = await handler(request(path, method, "acc-b"), ctx);

      expect(response.status).toBe(403);
      expect(categorizeCalls()).toEqual([]);
    });

    it("only queries rows scoped to the caller's own account", async () => {
      await handler(request(path, method, "acc-a"), ctx);

      // Guard against a vacuous pass: data routes must actually have queried.
      if (path !== "categorai/status") {
        expect(categorizeCalls().length).toBeGreaterThan(0);
      }
      const serialized = JSON.stringify(categorizeCalls());
      expect(serialized).not.toContain("acc-b");
      expect(serialized).not.toContain("user-b");
      for (const call of categorizeCalls()) {
        if (call.model === "$queryRaw") continue;
        expect(JSON.stringify(call.args)).toContain("acc-a");
      }
    });
  });

  it("returns 403 when no email account header is sent", async () => {
    const response = await getCategories(
      new NextRequest("http://localhost/api/categorai/categories"),
      ctx as never,
    );
    expect(response.status).toBe(403);
    expect(categorizeCalls()).toEqual([]);
  });
});

describe("User-level CategorAIze routes read only the session user", () => {
  beforeEach(() => {
    prisma.emailAccount.findMany.mockImplementation((async (args: {
      where: { userId: string };
    }) =>
      args.where.userId === "user-a"
        ? [{ id: "acc-a", email: "a@example.com" }]
        : [{ id: "acc-b", email: "b@example.com" }]) as never);
    prisma.categorizeAuditEvent.findMany.mockResolvedValue([]);
    prisma.categorizeUserConsent.findFirst.mockResolvedValue(null);
  });

  it("security log only asks for the user's own events and accounts", async () => {
    const response = await getAuditEvents(
      new NextRequest("http://localhost/api/user/audit-events"),
      ctx as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" } }),
    );
    expect(prisma.categorizeAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ userId: "user-a" }, { emailAccountId: { in: ["acc-a"] } }],
        },
      }),
    );
  });

  it("consent status only reads the session user's consent", async () => {
    const response = await getConsent(
      new NextRequest("http://localhost/api/user/categoraize-consent"),
      ctx as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.categorizeUserConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-a" }),
      }),
    );
  });
});
