import { describe, expect, it, vi } from "vitest";
import {
  getExplicitTenantUserId,
  withAccountContext,
  withUserContext,
} from "./tenant";

vi.mock("@/utils/prisma");

/**
 * A PrismaPromise is lazy: the query runs when `.then` is called, not when it
 * is created. This stand-in records the tenant visible at that moment.
 */
function lazyQuery() {
  const seen: Array<string | undefined> = [];
  const thenable = {
    // biome-ignore lint/suspicious/noThenProperty: mimics Prisma's lazy promise
    then(
      resolve: (value: string | undefined) => void,
      reject: (e: unknown) => void,
    ) {
      try {
        const tenant = getExplicitTenantUserId();
        seen.push(tenant);
        resolve(tenant);
      } catch (error) {
        reject(error);
      }
    },
  };
  return { thenable: thenable as unknown as Promise<string | undefined>, seen };
}

describe("tenant context with lazy Prisma queries (consent loop regression)", () => {
  it("runs a lazy query inside withUserContext with the tenant set", async () => {
    const { thenable, seen } = lazyQuery();
    const result = await withUserContext("user-a", () => thenable);
    expect(seen).toEqual(["user-a"]);
    expect(result).toBe("user-a");
  });

  it("does not leak the tenant after withUserContext returns", async () => {
    await withUserContext("user-a", async () => "done");
    expect(getExplicitTenantUserId()).toBeUndefined();
  });

  it("keeps nested contexts separate", async () => {
    const outer = lazyQuery();
    const inner = lazyQuery();
    await withUserContext("user-a", async () => {
      await withUserContext("user-b", () => inner.thenable);
      await outer.thenable;
    });
    expect(inner.seen).toEqual(["user-b"]);
    expect(outer.seen).toEqual(["user-a"]);
  });

  it("withAccountContext without a known owner just runs the query", async () => {
    const { thenable, seen } = lazyQuery();
    await withAccountContext("unknown-account", () => thenable);
    expect(seen).toEqual([undefined]);
  });
});
