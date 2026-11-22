import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { recordAuditEvent, sanitizeAuditMetadata } from "./audit";

vi.mock("@/utils/prisma");

describe("sanitizeAuditMetadata", () => {
  it("drops keys that could carry secrets, IPs or email content", () => {
    const clean = sanitizeAuditMetadata({
      accessToken: "ya29.abc",
      refresh_token: "1//xyz",
      clientSecret: "s",
      password: "p",
      ip: "203.0.113.4",
      ipAddress: "203.0.113.4",
      ip_address: "203.0.113.4",
      body: "Hello",
      bodyText: "Hello",
      subject: "Re: grades",
      snippet: "see attached",
      content: "x",
      provider: "google",
    });
    expect(clean).toEqual({ provider: "google" });
  });

  it("keeps ids, enums, counts and flags", () => {
    const metadata = {
      provider: "microsoft",
      emailAccountId: "acc_1",
      count: 3,
      enabled: true,
      previous: null,
      scopes: ["mail.read"],
    };
    expect(sanitizeAuditMetadata(metadata)).toEqual(metadata);
  });

  it("drops long strings that may be free text", () => {
    expect(sanitizeAuditMetadata({ note: "a".repeat(201) })).toBeUndefined();
  });

  it("returns undefined for missing or fully-dropped metadata", () => {
    expect(sanitizeAuditMetadata(undefined)).toBeUndefined();
    expect(sanitizeAuditMetadata({ token: "t" })).toBeUndefined();
  });
});

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes the sanitized event", async () => {
    prisma.categorizeAuditEvent.create.mockResolvedValue({} as never);
    await recordAuditEvent({
      eventType: "login",
      userId: "user_1",
      metadata: { provider: "google", accessToken: "secret" },
    });
    expect(prisma.categorizeAuditEvent.create).toHaveBeenCalledWith({
      data: {
        eventType: "login",
        userId: "user_1",
        emailAccountId: null,
        metadata: { provider: "google" },
      },
    });
  });

  it("omits metadata when nothing survives sanitizing", async () => {
    prisma.categorizeAuditEvent.create.mockResolvedValue({} as never);
    await recordAuditEvent({ eventType: "logout", metadata: { token: "t" } });
    expect(prisma.categorizeAuditEvent.create).toHaveBeenCalledWith({
      data: { eventType: "logout", userId: null, emailAccountId: null },
    });
  });

  it("swallows database errors so callers never break", async () => {
    prisma.categorizeAuditEvent.create.mockRejectedValue(
      new Error("connection refused"),
    );
    await expect(
      recordAuditEvent({ eventType: "login", userId: "user_1" }),
    ).resolves.toBeUndefined();
  });
});
