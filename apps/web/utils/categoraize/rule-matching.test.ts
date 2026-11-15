import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ matchEmail: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/categoraize/client", () => ({ matchEmail: mocks.matchEmail }));

const { semanticChooseRule } = await import("./rule-matching");
const { semanticIsColdEmail } = await import("./cold-email");
const { ruleDescriptions } = await import("./multi-match");

const RULES = [
  { name: "Newsletter", instructions: "Newsletters and mailing lists" },
  { name: "Receipt", instructions: "Receipts and invoices" },
  {
    name: "To Reply",
    instructions: "Emails I need to reply to",
    systemType: "TO_REPLY",
  },
];
const EMAIL = { subject: "Your receipt", content: "Payment received." };

// The service returns one row per short description ("<group>::<n>").
function serviceMatch(
  rows: Array<[string, number]>,
  hasTask = false,
): { ranked: { id: string; similarity: number }[]; has_task: boolean } {
  return {
    ranked: rows.map(([id, similarity]) => ({ id, similarity })),
    has_task: hasTask,
  };
}

describe("ruleDescriptions", () => {
  it("splits a rule into its name, text and listed items, dropping exclusions", () => {
    expect(
      ruleDescriptions(
        "Marketing",
        "Marketing: Promotions, sales, and offers. Exclude emails about account access.",
      ),
    ).toEqual([
      "Marketing",
      "Promotions, sales, and offers",
      "Promotions",
      "sales",
      "offers",
    ]);
  });
});

describe("semanticChooseRule", () => {
  beforeEach(() => mocks.matchEmail.mockReset());

  it("scores each rule by its best description and picks the best above the threshold", async () => {
    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["1::2", 0.52],
        ["1::0", 0.3],
        ["2::0", 0.4],
        ["0::1", 0.2],
      ]),
    );
    const result = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    expect(result.rules).toEqual([{ rule: RULES[1], isPrimary: true }]);
    expect(result.reason).toContain("0.52");
  });

  it("returns no rule when nothing reaches the threshold", async () => {
    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["0::0", 0.3],
        ["1::0", 0.2],
        ["2::0", 0.1],
      ]),
    );
    const result = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: true,
    });
    expect(result.rules).toEqual([]);
    expect(result.reason).toContain("no rule reached");
  });

  it("boosts To Reply when the tagger finds a request", async () => {
    const rows: Array<[string, number]> = [
      ["1::0", 0.45],
      ["2::0", 0.36],
    ];
    mocks.matchEmail.mockResolvedValue(serviceMatch(rows, true));
    const withRequest = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    expect(withRequest.rules[0].rule.name).toBe("To Reply");

    mocks.matchEmail.mockResolvedValue(serviceMatch(rows, false));
    const withoutRequest = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    expect(withoutRequest.rules[0].rule.name).toBe("Receipt");
  });

  it("adds one close second rule only when multiple rules are allowed", async () => {
    mocks.matchEmail.mockResolvedValue(
      serviceMatch([
        ["1::0", 0.52],
        ["0::0", 0.49],
        ["2::0", 0.2],
      ]),
    );
    const multi = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: true,
    });
    expect(multi.rules).toEqual([
      { rule: RULES[1], isPrimary: true },
      { rule: RULES[0], isPrimary: false },
    ]);
    const single = await semanticChooseRule({
      email: EMAIL,
      rules: RULES,
      allowMultiple: false,
    });
    expect(single.rules).toHaveLength(1);
  });
});

describe("semanticIsColdEmail", () => {
  beforeEach(() => mocks.matchEmail.mockReset());

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
