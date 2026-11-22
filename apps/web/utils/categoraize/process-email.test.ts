import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("undici", () => ({ Agent: class Agent {} }));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: { defineExtension: (fn: unknown) => fn },
}));
vi.mock("@/generated/prisma/enums", () => ({
  CategorizeContactRole: {
    DIRECT_REPORT: "DIRECT_REPORT",
    MANAGER: "MANAGER",
    DIRECTOR_EXECUTIVE: "DIRECTOR_EXECUTIVE",
    EXTERNAL_VENDOR: "EXTERNAL_VENDOR",
  },
}));
vi.mock("@/utils/categoraize/tenant", () => ({
  withAccountContext: (_id: string, fn: () => Promise<unknown>) => fn(),
  withUserContext: (_id: string, fn: () => Promise<unknown>) => fn(),
  getTenantTransaction: () => undefined,
  getExplicitTenantUserId: () => undefined,
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/categoraize/client");
vi.mock("@/utils/categoraize/vectors");
vi.mock("@/utils/categoraize/calendar-busy");
vi.mock("@/utils/categoraize/mailbox-timezone");

import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import * as client from "@/utils/categoraize/client";
import * as vectors from "@/utils/categoraize/vectors";
import * as calendarBusy from "@/utils/categoraize/calendar-busy";
import * as timezone from "@/utils/categoraize/mailbox-timezone";
import { classifyAndStoreEmail } from "./process-email";

const mockPrisma = prisma as unknown as {
  emailAccount: { findUnique: ReturnType<typeof vi.fn> };
  categorizeUserSettings: { findUnique: ReturnType<typeof vi.fn> };
  categorizeClassification: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  categorizeExtractedSpan: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
  };
};

const ACCOUNT_ID = "acct-pii-test";
const USER_ID = "user-pii-test";
const THREAD_ID = "thread-1";
const MESSAGE_ID = "msg-1";

const PHONE_RAW = "0917-123-4567";
const SSS_RAW = "34-1234567-8";

const BASE_EMAIL = {
  threadId: THREAD_ID,
  messageId: MESSAGE_ID,
  from: "sender@example.com",
  receivedAt: new Date("2026-01-01T08:00:00Z"),
};

function minimalClassifyResult(overrides: Record<string, unknown> = {}) {
  return {
    category: null,
    ranked: [],
    suggested_label: null,
    learned_priority: null,
    priority: { level: 3, factors: {}, deadline: null },
    sender_register: null,
    language: "en",
    spans: [],
    embedding: [],
    timings_ms: { total: 50 },
    pii_masked: { phone: 0, card: 0, gov_id: 0 },
    ...overrides,
  };
}

function setup() {
  vi.clearAllMocks();
  mockPrisma.emailAccount.findUnique.mockResolvedValue({ userId: USER_ID });
  mockPrisma.categorizeUserSettings.findUnique.mockResolvedValue(null); // null → masking on
  mockPrisma.categorizeClassification.findUnique.mockResolvedValue(null);
  mockPrisma.categorizeClassification.upsert.mockResolvedValue({ id: "cls-1" });
  mockPrisma.categorizeExtractedSpan.deleteMany.mockResolvedValue({});
  mockPrisma.categorizeExtractedSpan.createMany.mockResolvedValue({});
  vi.mocked(client.isCategoraizeEnabled).mockReturnValue(true);
  vi.mocked(client.classifyEmail).mockResolvedValue(
    minimalClassifyResult() as never,
  );
  vi.mocked(vectors.getCategoryVectors).mockResolvedValue([]);
  vi.mocked(vectors.setClassificationEmbedding).mockResolvedValue(undefined);
  vi.mocked(calendarBusy.getCalendarBusyForPriority).mockResolvedValue(null);
  vi.mocked(timezone.resolveMailboxTimezone).mockResolvedValue("Asia/Manila");
}

describe("classifyAndStoreEmail — PII masking integration", () => {
  it("strips phone and gov-ID numbers from subject and body before the NLP call", async () => {
    setup();
    const subject = `Urgent: call ${PHONE_RAW}`;
    const body = `SSS ${SSS_RAW}. Please respond by tomorrow.`;

    await classifyAndStoreEmail({
      emailAccountId: ACCOUNT_ID,
      email: { ...BASE_EMAIL, subject, body },
      logger: createScopedLogger("test"),
    });

    const nlpPayload = vi.mocked(client.classifyEmail).mock.calls[0][0];
    expect(nlpPayload.subject).toBe("Urgent: call [PHONE]");
    expect(nlpPayload.body).toBe("SSS [GOV_ID]. Please respond by tomorrow.");
    expect(nlpPayload.subject).not.toContain(PHONE_RAW);
    expect(nlpPayload.body).not.toContain(SSS_RAW);
  });

  it("stores masked text in the database, not the original PII", async () => {
    setup();
    const subject = "Payment card 4111 1111 1111 1111 attached";
    const body = `Please call ${PHONE_RAW} for details.`;

    await classifyAndStoreEmail({
      emailAccountId: ACCOUNT_ID,
      email: { ...BASE_EMAIL, subject, body },
      logger: createScopedLogger("test"),
    });

    const upsertCall =
      mockPrisma.categorizeClassification.upsert.mock.calls[0][0];
    expect(upsertCall.create.subject).toBe("Payment card [CARD] attached");
    expect(upsertCall.create.bodyText).toBe("Please call [PHONE] for details.");
    expect(upsertCall.create.subject).not.toContain("4111");
    expect(upsertCall.create.bodyText).not.toContain(PHONE_RAW);
  });

  it("records piiMaskedCount on the stored classification", async () => {
    setup();
    const subject = `Call ${PHONE_RAW}`;
    const body = `SSS ${SSS_RAW}`;

    await classifyAndStoreEmail({
      emailAccountId: ACCOUNT_ID,
      email: { ...BASE_EMAIL, subject, body },
      logger: createScopedLogger("test"),
    });

    const upsertCall =
      mockPrisma.categorizeClassification.upsert.mock.calls[0][0];
    expect(upsertCall.create.piiMaskedCount).toBe(2);
  });

  it("sends unmasked text when masking is turned off for the account", async () => {
    setup();
    // Override: user has explicitly disabled masking
    mockPrisma.categorizeUserSettings.findUnique.mockResolvedValue({
      piiMaskingEnabled: false,
    });
    const subject = `Call ${PHONE_RAW}`;
    const body = `SSS ${SSS_RAW}`;

    await classifyAndStoreEmail({
      emailAccountId: ACCOUNT_ID,
      email: { ...BASE_EMAIL, subject, body },
      logger: createScopedLogger("test"),
    });

    const nlpPayload = vi.mocked(client.classifyEmail).mock.calls[0][0];
    expect(nlpPayload.subject).toContain(PHONE_RAW);
    expect(nlpPayload.body).toContain(SSS_RAW);

    const upsertCall =
      mockPrisma.categorizeClassification.upsert.mock.calls[0][0];
    expect(upsertCall.create.subject).toContain(PHONE_RAW);
    expect(upsertCall.create.piiMaskedCount).toBe(0);
  });
});
