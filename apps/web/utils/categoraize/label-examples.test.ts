import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/categoraize/process-email", () => ({ reclassifyStoredEmail: vi.fn() }));
vi.mock("@/utils/categoraize/vectors", () => ({}));
vi.mock("@/utils/categoraize/client", () => ({ embedTexts: vi.fn() }));

import { combineCentroid, EXAMPLE_WEIGHT } from "@/utils/categoraize/label-examples";

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
const cosine = (a: number[], b: number[]) =>
  a.reduce((s, x, i) => s + x * b[i], 0) / (norm(a) * norm(b));

describe("combineCentroid", () => {
  it("is the normalised description when the label has no examples", () => {
    const centroid = combineCentroid([3, 4, 0], null);
    expect(centroid).toEqual([0.6, 0.8, 0]);
  });

  it("moves strongly toward the examples (weight 4)", () => {
    const description = [1, 0, 0];
    const examples = [0, 1, 0];
    const centroid = combineCentroid(description, examples);
    expect(EXAMPLE_WEIGHT).toBe(4);
    expect(norm(centroid)).toBeCloseTo(1, 10);
    expect(cosine(centroid, examples)).toBeGreaterThan(cosine(centroid, description));
    expect(centroid[1] / centroid[0]).toBeCloseTo(4, 10);
  });

  it("keeps the description if the combination would vanish", () => {
    const centroid = combineCentroid([1, 0], [-0.25, 0]);
    expect(centroid).toEqual([1, 0]);
  });
});
