import { describe, expect, it } from "vitest";
import { scrubCategoraiizePii } from "./pii-scrubber";

describe("scrubCategoraiizePii", () => {
  it("masks Philippine mobile numbers", () => {
    expect(scrubCategoraiizePii("Call 0917-123-4567 or +639181234567.")).toBe(
      "Call [REDACTED] or [REDACTED].",
    );
  });

  it("masks supported financial and Philippine identifier formats", () => {
    const result = scrubCategoraiizePii(
      "Card 4111 1111 1111 1111, SSS 12-3456789-0, PhilHealth 12-345678901-2, TIN 123-456-789-000.",
    );

    expect(result).not.toContain("4111");
    expect(result).not.toContain("12-3456789-0");
    expect(result).not.toContain("12-345678901-2");
    expect(result).not.toContain("123-456-789-000");
    expect(result.match(/\[REDACTED\]/g)).toHaveLength(4);
  });

  it("does not alter ordinary operational text", () => {
    expect(scrubCategoraiizePii("Please review the staging deployment.")).toBe(
      "Please review the staging deployment.",
    );
  });
});
