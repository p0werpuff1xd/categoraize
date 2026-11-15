import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

const mocks = vi.hoisted(() => ({
  env: { CATEGORAIZE_RULE_MATCHING: true } as Record<string, boolean>,
  enabled: true,
  consent: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/utils/categoraize/client", async () => {
  class CategoraizeServiceError extends Error {
    status?: number;
  }
  return {
    CategoraizeServiceError,
    isCategoraizeEnabled: () => mocks.enabled,
  };
});
vi.mock("@/utils/categoraize/consent", () => ({
  hasExternalLlmConsent: async () => mocks.consent,
}));

const { runCategoraizeOrLlm, runCategoraizeCascade } = await import(
  "./features"
);
const { CategoraizeServiceError } = await import("@/utils/categoraize/client");

const logger = createScopedLogger("features-test");

function run(categoraize: () => Promise<string>) {
  return runCategoraizeOrLlm({
    feature: "ruleMatching",
    userId: "user-1",
    logger,
    categoraize,
    llm: async () => "llm",
  });
}

describe("runCategoraizeOrLlm", () => {
  beforeEach(() => {
    mocks.env.CATEGORAIZE_RULE_MATCHING = true;
    mocks.enabled = true;
    mocks.consent = false;
  });

  it("uses the service when the feature switch is on", async () => {
    await expect(run(async () => "service")).resolves.toBe("service");
  });

  it("restores the original LLM path when the switch is off", async () => {
    mocks.env.CATEGORAIZE_RULE_MATCHING = false;
    const service = vi.fn(async () => "service");
    await expect(run(service)).resolves.toBe("llm");
    expect(service).not.toHaveBeenCalled();
  });

  it("restores the original LLM path when CategorAIze is disabled", async () => {
    mocks.enabled = false;
    await expect(run(async () => "service")).resolves.toBe("llm");
  });

  it("falls back to the LLM on a service failure only with consent", async () => {
    mocks.consent = true;
    await expect(
      run(async () => {
        throw new CategoraizeServiceError("down");
      }),
    ).resolves.toBe("llm");
  });

  it("does not send mail to the external LLM without consent", async () => {
    const llm = vi.fn(async () => "llm");
    await expect(
      runCategoraizeOrLlm({
        feature: "ruleMatching",
        userId: "user-1",
        logger,
        categoraize: async () => {
          throw new CategoraizeServiceError("down");
        },
        llm,
      }),
    ).rejects.toThrow("external AI processing is turned off");
    expect(llm).not.toHaveBeenCalled();
  });

  it("cascade: a confident local answer never reaches the LLM", async () => {
    mocks.consent = true;
    const llm = vi.fn(async () => "llm");
    await expect(
      runCategoraizeCascade({
        feature: "ruleMatching",
        userId: "user-1",
        logger,
        local: async () => ({ result: "local", confident: true }),
        llm,
      }),
    ).resolves.toBe("local");
    expect(llm).not.toHaveBeenCalled();
  });

  it("cascade: an unsure answer goes to the LLM only with consent", async () => {
    const llm = vi.fn(async () => "llm");
    const unsure = async () => ({ result: "local", confident: false });

    await expect(
      runCategoraizeCascade({
        feature: "ruleMatching",
        userId: "u",
        logger,
        local: unsure,
        llm,
      }),
    ).resolves.toBe("local");
    expect(llm).not.toHaveBeenCalled();

    mocks.consent = true;
    await expect(
      runCategoraizeCascade({
        feature: "ruleMatching",
        userId: "u",
        logger,
        local: unsure,
        llm,
      }),
    ).resolves.toBe("llm");
    expect(llm).toHaveBeenCalledWith("local");
  });

  it("cascade: keeps the local answer when the LLM fails", async () => {
    mocks.consent = true;
    await expect(
      runCategoraizeCascade({
        feature: "ruleMatching",
        userId: "u",
        logger,
        local: async () => ({ result: "local", confident: false }),
        llm: async () => {
          throw new Error("provider down");
        },
      }),
    ).resolves.toBe("local");
  });

  it("does not hide bugs: non-service errors are rethrown", async () => {
    mocks.consent = true;
    await expect(
      run(async () => {
        throw new TypeError("bug");
      }),
    ).rejects.toThrow("bug");
  });
});
