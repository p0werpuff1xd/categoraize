import { describe, expect, it } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";

const logger = createTestLogger();

// IAS Phase 11 J: Philippine PII is masked before any external-LLM request.
describe("enforceSensitiveDataPolicy with PII masking", () => {
  const options = {
    instructions: "You are a helpful assistant.",
    prompt: "Reply to Ana (0917-123-4567, TIN 123-456-789) about bukas.",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Card 4111 1111 1111 1111" }],
      },
    ],
  };

  it("masks prompt and messages when on, even under the ALLOW policy", () => {
    const result = enforceSensitiveDataPolicy({
      options,
      policy: "ALLOW",
      logger,
      label: "test",
      maskPii: true,
    });
    const sent = JSON.stringify(result);
    expect(sent).not.toMatch(/0917|123-456-789|4111/);
    expect(result.prompt).toBe(
      "Reply to Ana ([PHONE], TIN [GOV_ID]) about bukas.",
    );
    expect(JSON.stringify(result.messages)).toContain("[CARD]");
    expect(result.instructions).toBe(options.instructions);
  });

  it("leaves the request untouched when off", () => {
    const result = enforceSensitiveDataPolicy({
      options,
      policy: "ALLOW",
      logger,
      label: "test",
      maskPii: false,
    });
    expect(result).toBe(options);
  });

  it("still applies the upstream policy after masking", () => {
    expect(() =>
      enforceSensitiveDataPolicy({
        options: { prompt: `api_key=${"a".repeat(24)} call 0917-123-4567` },
        policy: "BLOCK",
        logger,
        label: "test",
        maskPii: true,
      }),
    ).toThrow();
  });
});
