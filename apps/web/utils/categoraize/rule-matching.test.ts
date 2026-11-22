import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  matchEmail: vi.fn(),
  chooseRuleLocally: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/categoraize/client", () => ({
  matchEmail: mocks.matchEmail,
  chooseRuleLocally: mocks.chooseRuleLocally,
}));

const { semanticChooseRule } = await import("./rule-matching");
const { semanticIsColdEmail } = await import("./cold-email");
const { CONVERSATION_TRACKING_META_RULE_ID } = await import(
  "@/utils/reply-tracker/conversation-status-config"
);

const { getRuleConfig } = await import("@/utils/rule/consts");

const RULES = [
  {
    name: "Newsletter",
    instructions: getRuleConfig("NEWSLETTER").instructions,
    systemType: "NEWSLETTER",
  },
  // Rewritten by the user: only their wording counts, no built-in kind.
  {
    name: "Receipt",
    instructions: "Receipts and invoices",
    systemType: "RECEIPT",
  },
  {
    id: CONVERSATION_TRACKING_META_RULE_ID,
    name: "Conversations",
    instructions: "Emails I need to reply to",
    systemType: null,
  },
];
const EMAIL = { subject: "Your receipt", content: "Payment received." };

function local(overrides: Record<string, unknown>) {
  return {
    ranked: [
      { id: "1", similarity: 0.6 },
      { id: "0", similarity: 0.4 },
    ],
    matched: ["1"],
    confident: true,
    reasons: [],
    has_request: false,
    params: { threshold: 0.45 },
    ...overrides,
  };
}

describe("semanticChooseRule", () => {
  beforeEach(() => mocks.chooseRuleLocally.mockReset());

  it("sends the built-in kind only for unedited rules and marks Conversations as the reply rule", async () => {
    mocks.chooseRuleLocally.mockResolvedValue(local({}));
    await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    const sent = mocks.chooseRuleLocally.mock.calls[0][0].rules;
    expect(
      sent.map((r: { system_type: string | null }) => r.system_type),
    ).toEqual(["NEWSLETTER", null, null]);
    expect(sent.map((r: { reply_needed: boolean }) => r.reply_needed)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("returns the matched rule and the service's confidence", async () => {
    mocks.chooseRuleLocally.mockResolvedValue(local({}));
    const result = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    expect(result.rules).toEqual([{ rule: RULES[1], isPrimary: true }]);
    expect(result.confident).toBe(true);
    expect(result.reason).toContain('"Receipt" 0.60');
  });

  it("reports why it is unsure and returns no rule when nothing matched", async () => {
    mocks.chooseRuleLocally.mockResolvedValue(
      local({
        matched: [],
        confident: false,
        reasons: ["best rule is just below the threshold"],
      }),
    );
    const result = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: true,
    });
    expect(result.rules).toEqual([]);
    expect(result.confident).toBe(false);
    expect(result.reason).toContain(
      "unsure: best rule is just below the threshold",
    );
  });
});

describe("semanticIsColdEmail", () => {
  beforeEach(() => mocks.matchEmail.mockReset());

  function serviceMatch(rows: Array<[string, number]>) {
    return {
      ranked: rows.map(([id, similarity]) => ({ id, similarity })),
      has_task: false,
    };
  }

  it("is cold only when a cold description beats every legitimate one", async () => {
    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["cold::1", 0.48],
        ["service::0", 0.3],
      ]),
    );
    await expect(
      semanticIsColdEmail({ email: EMAIL, instructions: null }),
    ).resolves.toMatchObject({ isColdEmail: true });

    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["customer::0", 0.5],
        ["cold::0", 0.47],
      ]),
    );
    await expect(
      semanticIsColdEmail({ email: EMAIL, instructions: null }),
    ).resolves.toMatchObject({ isColdEmail: false });
  });

  it("adds the user's custom cold-email instructions as another cold description", async () => {
    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["cold-custom::0", 0.4],
        ["cold::0", 0.3],
      ]),
    );
    const result = await semanticIsColdEmail({
      email: EMAIL,
      instructions: "Recruiters pitching job offers",
    });
    expect(result.isColdEmail).toBe(true);
    const ids = mocks.matchEmail.mock.calls[0][0].candidates.map(
      (candidate: { id: string }) => candidate.id,
    );
    expect(ids).toContain("cold-custom::0");
  });
});
