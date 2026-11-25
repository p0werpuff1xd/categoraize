import { describe, expect, it } from "vitest";
import {
  CategoraizeServiceError,
  categoraizeUserMessage,
} from "@/utils/categoraize/client";

describe("categoraizeUserMessage", () => {
  it("explains a timeout instead of an unknown error", () => {
    const error = new CategoraizeServiceError(
      "CategorAIze service is unreachable: The operation was aborted due to timeout",
    );
    expect(categoraizeUserMessage(error)).toBe(
      "The sorting service took too long to respond. Please try again in a minute.",
    );
  });

  it("explains server errors and rate limits", () => {
    expect(
      categoraizeUserMessage(new CategoraizeServiceError("HTTP 503", 503)),
    ).toContain("had a problem");
    expect(
      categoraizeUserMessage(new CategoraizeServiceError("HTTP 429", 429)),
    ).toContain("busy");
  });

  it("never repeats the service's response body", () => {
    const error = new CategoraizeServiceError(
      "CategorAIze service returned HTTP 422: subject: Paki-submit the secret report",
      422,
    );
    expect(categoraizeUserMessage(error)).not.toContain("Paki-submit");
  });

  it("says when sorting is turned off", () => {
    expect(
      categoraizeUserMessage(
        new CategoraizeServiceError("CategorAIze service is not enabled"),
      ),
    ).toBe("Smart sorting is turned off for this workspace.");
  });
});
