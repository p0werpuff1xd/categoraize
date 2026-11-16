/**
 * IAS Phase 7 D: tenant isolation for CategorAIze server actions.
 *
 * User A owns acc-a; user B owns acc-b. Signed in as A, every CategorAIze
 * action must (1) refuse acc-b outright and (2) when bound to acc-a, refuse to
 * touch rows that belong to acc-b even if A sends B's row IDs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-a", email: "a@example.com" },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: vi.fn(async () => undefined),
}));
// Service "on" so actions reach their row lookups; the NLP is never called
// because every cross-account lookup returns nothing first.
vi.mock("@/utils/categoraize/client", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/categoraize/client")>()),
  isCategoraizeEnabled: () => true,
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => {
    throw new Error("provider must not be created in isolation tests");
  }),
}));

import {
  createCategoraizeCategoryAction,
  createCategoryFromSuggestionAction,
  deleteCategoraizeCategoryAction,
  updateCategoraizeCategoryAction,
  upsertCategoraizeContactAction,
} from "@/utils/actions/categoraize";
import {
  acceptCategoraizeCategoryAction,
  classifyRecentCategoraizeEmailsAction,
  correctCategoraizeCategoryAction,
  previewCategoraizeClassificationAction,
  rateCategoraizePriorityAction,
  reclassifyStoredCategoraizeEmailsAction,
  setCategoraizeManualPriorityAction,
} from "@/utils/actions/categoraize-classification";
import {
  acceptCategoraizeConsentAction,
  withdrawCategoraizeConsentAction,
} from "@/utils/actions/categoraize-consent";
import {
  confirmCategoraizeDeadlineAction,
  dismissCategoraizeSpanAction,
} from "@/utils/actions/categoraize-deadlines";
import { answerPriorityProposalAction } from "@/utils/actions/categoraize-feedback";

const ACCOUNTS: Record<string, { userId: string; email: string }> = {
  "acc-a": { userId: "user-a", email: "a@example.com" },
  "acc-b": { userId: "user-b", email: "b@example.com" },
};

// Rows owned by B's account. A must never be able to read or change them.
const B_ROWS = {
  categorizeCategory: [{ id: "cat-b", emailAccountId: "acc-b" }],
  categorizeClassification: [
    { id: "cls-b", emailAccountId: "acc-b", categoryId: "cat-b" },
  ],
  categorizeExtractedSpan: [
    { id: "span-b", emailAccountId: "acc-b", label: "DATE" },
  ],
} as const;

type Model = keyof typeof B_ROWS;

const CATEGORIZE_MODELS = [
  "categorizeCategory",
  "categorizeClassification",
  "categorizeContact",
  "categorizeExtractedSpan",
  "categorizeFeedbackEvent",
  "categorizePriorityOverrideLog",
  "categorizeProposalDecision",
  "categorizeUserConsent",
] as const;

const READ_METHODS = ["findFirst", "findMany", "findUnique", "count"] as const;
const WRITE_METHODS = [
  "create",
  "createMany",
  "update",
  "upsert",
  "delete",
] as const;
const FILTERED_WRITE_METHODS = ["updateMany", "deleteMany"] as const;

type AnyMock = { mock: { calls: unknown[][] } };

function modelMock(model: string, method: string): AnyMock {
  return (prisma as unknown as Record<string, Record<string, AnyMock>>)[model][
    method
  ];
}

function callsOf(methods: readonly string[]) {
  return CATEGORIZE_MODELS.flatMap((model) =>
    methods.flatMap((method) =>
      modelMock(model, method).mock.calls.map((args) => ({
        model,
        method,
        args: args[0] as { where?: Record<string, unknown> } | undefined,
      })),
    ),
  );
}

// Scalar where-clause matcher, enough for id / emailAccountId / label filters.
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown> = {},
) {
  return Object.entries(where).every(([key, value]) =>
    value !== null && typeof value === "object" ? true : row[key] === value,
  );
}

function backModelsWithBRows() {
  for (const model of Object.keys(B_ROWS) as Model[]) {
    const rows = B_ROWS[model] as readonly Record<string, unknown>[];
    const m = (prisma as unknown as Record<string, Record<string, any>>)[model];
    m.findFirst.mockImplementation(
      async (args: { where?: Record<string, unknown> }) =>
        rows.find((row) => matches(row, args?.where)) ?? null,
    );
    m.updateMany.mockImplementation(
      async (args: { where?: Record<string, unknown> }) => ({
        count: rows.filter((row) => matches(row, args?.where)).length,
      }),
    );
    m.deleteMany.mockImplementation(
      async (args: { where?: Record<string, unknown> }) => ({
        count: rows.filter((row) => matches(row, args?.where)).length,
      }),
    );
  }
}

const EMAIL_ACCOUNT_ACTIONS = [
  ["createCategoraizeCategory", createCategoraizeCategoryAction, { name: "X" }],
  [
    "updateCategoraizeCategory",
    updateCategoraizeCategoryAction,
    { categoryId: "cat-b", name: "X" },
  ],
  [
    "deleteCategoraizeCategory",
    deleteCategoraizeCategoryAction,
    { categoryId: "cat-b" },
  ],
  [
    "createCategoryFromSuggestion",
    createCategoryFromSuggestionAction,
    { classificationId: "cls-b" },
  ],
  [
    "upsertCategoraizeContact",
    upsertCategoraizeContactAction,
    { email: "boss@example.com", role: null, isVip: true },
  ],
  [
    "correctCategoraizeCategory",
    correctCategoraizeCategoryAction,
    { classificationId: "cls-b", categoryId: "cat-b" },
  ],
  [
    "acceptCategoraizeCategory",
    acceptCategoraizeCategoryAction,
    { classificationId: "cls-b" },
  ],
  [
    "setCategoraizeManualPriority",
    setCategoraizeManualPriorityAction,
    { classificationId: "cls-b", priority: 5 },
  ],
  [
    "rateCategoraizePriority",
    rateCategoraizePriorityAction,
    { classificationId: "cls-b", accurate: true },
  ],
  [
    "classifyRecentCategoraizeEmails",
    classifyRecentCategoraizeEmailsAction,
    { limit: 1 },
  ],
  [
    "reclassifyStoredCategoraizeEmails",
    reclassifyStoredCategoraizeEmailsAction,
    { limit: 1 },
  ],
  [
    "previewCategoraizeClassification",
    previewCategoraizeClassificationAction,
    { body: "hello" },
  ],
  [
    "confirmCategoraizeDeadline",
    confirmCategoraizeDeadlineAction,
    { spanId: "span-b" },
  ],
  [
    "dismissCategoraizeSpan",
    dismissCategoraizeSpanAction,
    { spanId: "span-b" },
  ],
  [
    "answerPriorityProposal",
    answerPriorityProposalAction,
    { key: "k", accept: true },
  ],
] as const;

// Actions that take a row ID: bound to A's own account but given B's row.
const ROW_ID_ACTIONS = new Set([
  "updateCategoraizeCategory",
  "deleteCategoraizeCategory",
  "createCategoryFromSuggestion",
  "correctCategoraizeCategory",
  "acceptCategoraizeCategory",
  "setCategoraizeManualPriority",
  "rateCategoraizePriority",
  "confirmCategoraizeDeadline",
  "dismissCategoraizeSpan",
]);

type BoundAction = (
  emailAccountId: string,
  input: unknown,
) => Promise<{ serverError?: string; validationErrors?: unknown } | undefined>;

describe("CategorAIze server actions: tenant isolation", () => {
  beforeEach(() => {
    prisma.emailAccount.findUnique.mockImplementation((async (args: {
      where: { id: string };
    }) => {
      const account = ACCOUNTS[args.where.id];
      if (!account) return null;
      return {
        email: account.email,
        account: { userId: account.userId, provider: "google" },
      };
    }) as never);
    backModelsWithBRows();
  });

  describe.each(EMAIL_ACCOUNT_ACTIONS)("%s", (name, action, input) => {
    it("rejects another user's email account before touching CategorAIze data", async () => {
      const result = await (action as unknown as BoundAction)("acc-b", input);

      expect(result?.serverError).toBe("Unauthorized");
      expect(
        callsOf([...READ_METHODS, ...WRITE_METHODS, ...FILTERED_WRITE_METHODS]),
      ).toEqual([]);
    });

    if (ROW_ID_ACTIONS.has(name)) {
      it("refuses another account's row even on the user's own account", async () => {
        const result = await (action as unknown as BoundAction)("acc-a", input);

        expect(result?.validationErrors).toBeUndefined();
        expect(result?.serverError).toBeTruthy();
        expect(callsOf(WRITE_METHODS)).toEqual([]);

        const scoped = callsOf([...READ_METHODS, ...FILTERED_WRITE_METHODS]);
        expect(scoped.length).toBeGreaterThan(0);
        for (const call of scoped) {
          expect(call.args?.where?.emailAccountId).toBe("acc-a");
        }
      });
    }
  });

  it("rejects an email account ID that does not exist", async () => {
    const result = await createCategoraizeCategoryAction("acc-missing", {
      name: "X",
    });
    expect(result?.serverError).toBe("Unauthorized");
  });
});

describe("CategorAIze consent actions: only the signed-in user", () => {
  it("records consent for the session user, ignoring a userId in the input", async () => {
    prisma.categorizeUserConsent.create.mockResolvedValue({} as never);

    await acceptCategoraizeConsentAction({
      acceptTerms: true,
      externalLlmEnabled: false,
      userId: "user-b",
    } as never);

    expect(prisma.categorizeUserConsent.create).toHaveBeenCalledTimes(1);
    const data = prisma.categorizeUserConsent.create.mock.calls[0][0].data;
    expect(data.userId).toBe("user-a");
  });

  it("withdraws only the session user's consent rows", async () => {
    prisma.categorizeUserConsent.updateMany.mockResolvedValue({
      count: 1,
    } as never);

    await withdrawCategoraizeConsentAction();

    expect(prisma.categorizeUserConsent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-a", withdrawnAt: null },
      }),
    );
  });
});
