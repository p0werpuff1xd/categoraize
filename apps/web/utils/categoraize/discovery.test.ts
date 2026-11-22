import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/categoraize/client", () => ({ discoverClusters: vi.fn() }));

import { clusterKey, nameFromTerms } from "./discovery";

describe("category discovery naming", () => {
  it("names a cluster from terms shared by its subjects, without stopwords", () => {
    expect(
      nameFromTerms([
        "Your electricity bill for November",
        "Electricity bill reminder",
        "Paalala: bill sa kuryente",
      ]),
    ).toBe("Bill & Electricity");
  });

  it("returns nothing when no term repeats", () => {
    expect(
      nameFromTerms(["Lunch on Friday", "Server alert", "Thesis draft"]),
    ).toBe("");
  });

  it("keys a cluster by its members regardless of order", () => {
    expect(clusterKey(["b", "a", "c"])).toBe(clusterKey(["c", "b", "a"]));
    expect(clusterKey(["a", "b"])).not.toBe(clusterKey(["a", "b", "c"]));
    expect(clusterKey(["a"])).toMatch(/^cluster:[0-9a-f]{24}$/);
  });
});
