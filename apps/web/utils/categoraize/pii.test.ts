import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { luhnValid, maskPii, maskPiiDeep } from "./pii";

type Vector = {
  name: string;
  input: string;
  expected: string;
  counts: { phone: number; card: number; gov_id: number };
};

// Shared with fastapi_core/tests/test_pii.py so both maskers stay identical.
const vectors: Vector[] = JSON.parse(
  readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../fastapi_core/tests/data/pii_vectors.json",
    ),
    "utf8",
  ),
).cases;

describe("maskPii (shared vectors)", () => {
  it("has vectors", () => expect(vectors.length).toBeGreaterThan(20));

  for (const vector of vectors) {
    it(vector.name, () => {
      const result = maskPii(vector.input);
      expect(result.text).toBe(vector.expected);
      expect(result.counts).toEqual(vector.counts);
    });
  }
});

describe("luhnValid", () => {
  it("accepts test cards and rejects near misses", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
  });
});

describe("maskPiiDeep", () => {
  it("masks strings inside LLM messages and counts them", () => {
    const messages = [
      { role: "user", content: "Call 0917-123-4567" },
      { role: "user", content: [{ type: "text", text: "SSS 34-1234567-8" }] },
    ];
    const { value, masked } = maskPiiDeep(messages);
    expect(masked).toBe(2);
    expect(JSON.stringify(value)).not.toMatch(/0917|34-1234567/);
  });

  it("returns the same object when nothing was masked", () => {
    const input = { prompt: "Nothing to hide" };
    expect(maskPiiDeep(input).value).toBe(input);
  });
});
