// Field encryption through the row-level-security tenant wrapper, against a
// real database (RUN_DB_TESTS=true, local Docker Postgres). Regression for the
// production error "CategorizeClassification.subject holds a value that is not
// ciphertext": the wrapper re-ran the encryption extension, so writes were
// encrypted twice and reads decrypted twice.
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { encryptField } from "@/utils/categoraize/field-encryption";
import { withUserContext } from "@/utils/categoraize/tenant";
import { runWithAuditContext } from "@/utils/audit/context";

const TABLE = "CategorizeExtractedSpan";

// Setup and raw reads bypass row-level security. Run the app client as the
// non-bypass role (DATABASE_URL=...categoraize_app...) with DB_ADMIN_URL set
// to an owner role, or RLS is not exercised at all.
const admin = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DB_ADMIN_URL ?? process.env.DATABASE_URL,
  }),
});
const created: string[] = [];

async function target() {
  const [row] = await admin.$queryRaw<
    { id: string; emailAccountId: string; userId: string }[]
  >`SELECT c.id, c."emailAccountId", ea."userId" FROM "CategorizeClassification" c
     JOIN "EmailAccount" ea ON ea.id = c."emailAccountId" LIMIT 1`;
  if (!row)
    throw new Error("needs one CategorizeClassification row in the local DB");
  return row;
}

async function insertRaw(id: string, text: string) {
  const t = await target();
  await admin.$executeRaw`INSERT INTO "CategorizeExtractedSpan"
    (id, "updatedAt", label, text, source, start, "end", "classificationId", "emailAccountId")
    VALUES (${id}, now(), 'TASK', ${text}, 'body', 0, 5, ${t.id}, ${t.emailAccountId})`;
  created.push(id);
  return t;
}

async function rawText(id: string) {
  const [row] = await admin.$queryRaw<
    { text: string }[]
  >`SELECT text FROM "CategorizeExtractedSpan" WHERE id = ${id}`;
  return row.text;
}

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "field encryption through the tenant wrapper",
  () => {
    afterAll(async () => {
      if (created.length)
        await admin.$executeRaw`DELETE FROM "CategorizeExtractedSpan" WHERE id = ANY(${created})`;
    });

    it("encrypts a write exactly once and reads it back", async () => {
      const t = await target();
      const span = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.create({
          data: {
            label: "TASK",
            text: "probe-once",
            source: "body",
            start: 0,
            end: 5,
            classificationId: t.id,
            emailAccountId: t.emailAccountId,
          },
        }),
      );
      created.push(span.id);
      const stored = await rawText(span.id);
      const single = encryptField({
        table: TABLE,
        column: "text",
        rowId: span.id,
        plaintext: "x",
      });
      // One layer: the same length class as a fresh single encryption of a short text.
      expect(stored.startsWith("e1:")).toBe(true);
      expect(stored.length).toBeLessThan(single.length + 40);
      const read = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findUnique({ where: { id: span.id } }),
      );
      expect(read?.text).toBe("probe-once");
    });

    it("reads a single-encrypted row (backfilled data) without 'not ciphertext'", async () => {
      const id = `enc-single-${Date.now()}`;
      const t = await insertRaw(
        id,
        encryptField({
          table: TABLE,
          column: "text",
          rowId: id,
          plaintext: "probe-single",
        }),
      );
      const rows = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findMany({ where: { id } }),
      );
      expect(rows.map((r) => r.text)).toEqual(["probe-single"]);
    });

    // Regression: the row-id lookup for an update ran without a tenant, RLS
    // hid the row, and the new text was stored in plaintext (re-scoring).
    it("encrypts the text of an update and of an upsert's update branch", async () => {
      const id = `enc-update-${Date.now()}`;
      const t = await insertRaw(
        id,
        encryptField({
          table: TABLE,
          column: "text",
          rowId: id,
          plaintext: "old",
        }),
      );
      await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.update({
          where: { id },
          data: { text: "probe-update" },
        }),
      );
      expect((await rawText(id)).startsWith("e1:")).toBe(true);

      await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.upsert({
          where: { id },
          create: {
            label: "TASK",
            text: "unused",
            source: "body",
            start: 0,
            end: 5,
            classificationId: t.id,
            emailAccountId: t.emailAccountId,
          },
          update: { text: "probe-upsert" },
        }),
      );
      expect((await rawText(id)).startsWith("e1:")).toBe(true);
      const read = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findUnique({ where: { id } }),
      );
      expect(read?.text).toBe("probe-upsert");
    });

    // Server actions and routes resolve the tenant from the request's audit
    // context, not withUserContext (production: "Classify recent inbox").
    it.each([
      ["userId", (t: { userId: string }) => ({ userId: t.userId })],
      [
        "emailAccountId",
        (t: { emailAccountId: string }) => ({
          emailAccountId: t.emailAccountId,
        }),
      ],
    ] as const)("encrypts an upsert update under a request context with %s", async (_, ctx) => {
      const id = `enc-ctx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const t = await insertRaw(
        id,
        encryptField({
          table: TABLE,
          column: "text",
          rowId: id,
          plaintext: "old",
        }),
      );
      await runWithAuditContext(
        ctx(t as never),
        async () =>
          await prisma.categorizeExtractedSpan.upsert({
            where: { id },
            create: {
              label: "TASK",
              text: "unused",
              source: "body",
              start: 0,
              end: 5,
              classificationId: t.id,
              emailAccountId: t.emailAccountId,
            },
            update: { text: "probe-ctx" },
          }),
      );
      expect((await rawText(id)).startsWith("e1:")).toBe(true);
    });

    // Two jobs classifying the same new email at once: the second job's row
    // lookup ran before the first insert, so the native upsert's DO UPDATE
    // branch carried plaintext (production rows re-written by the webhook).
    it("never stores plaintext when two upserts of a new row race", async () => {
      const t = await target();
      for (let round = 0; round < 15; round++) {
        const id = `enc-race-${Date.now()}-${round}`;
        created.push(id);
        const write = (text: string) =>
          withUserContext(t.userId, () =>
            prisma.categorizeExtractedSpan.upsert({
              where: { id },
              create: {
                id,
                label: "TASK",
                text,
                source: "body",
                start: 0,
                end: 5,
                classificationId: t.id,
                emailAccountId: t.emailAccountId,
              },
              update: { text },
            }),
          ).catch(() => null);
        await Promise.all([write("race-a"), write("race-b"), write("race-c")]);
        const stored = await rawText(id).catch(() => null);
        if (stored !== null) expect(stored.startsWith("e1:")).toBe(true);
      }
    });

    it("reads a legacy double-encrypted row", async () => {
      const id = `enc-double-${Date.now()}`;
      const inner = encryptField({
        table: TABLE,
        column: "text",
        rowId: id,
        plaintext: "probe-double",
      });
      const t = await insertRaw(
        id,
        encryptField({
          table: TABLE,
          column: "text",
          rowId: id,
          plaintext: inner,
        }),
      );
      const rows = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findMany({ where: { id } }),
      );
      expect(rows.map((r) => r.text)).toEqual(["probe-double"]);
    });

    // Re-scoring read the stored body with a select that left out the id, got
    // ciphertext back, and stored a slice of it as the snippet, which then
    // failed authentication and broke the Priority Inbox.
    it("decrypts a select without the id, so a re-score keeps the text", async () => {
      const t = await target();
      const id = `enc-noid-${Date.now()}`;
      await insertRaw(
        id,
        encryptField({
          table: TABLE,
          column: "text",
          rowId: id,
          plaintext: "probe-noid",
        }),
      );
      const row = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findFirst({
          where: { id },
          select: { text: true },
        }),
      );
      expect(row?.text).toBe("probe-noid");
    });

    const layered = (id: string, plaintext: string, layers: number) => {
      let value = plaintext;
      for (let layer = 0; layer < layers; layer++) {
        value = encryptField({ table: TABLE, column: "text", rowId: id, plaintext: value });
      }
      return value;
    };

    it("reads a value encrypted three or four times", async () => {
      const t = await target();
      for (const layers of [3, 4]) {
        const id = `enc-layers${layers}-${Date.now()}`;
        await insertRaw(id, layered(id, `probe-${layers}`, layers));
        const row = await withUserContext(t.userId, () =>
          prisma.categorizeExtractedSpan.findUnique({ where: { id } }),
        );
        expect(row?.text).toBe(`probe-${layers}`);
      }
    });

    // A snippet cut from an encrypted body starts with "e1:" but is not a
    // valid ciphertext: return it as text instead of failing the whole list.
    it("returns a plaintext that only looks like ciphertext", async () => {
      const t = await target();
      const id = `enc-fake-${Date.now()}`;
      const fake = layered("other-row", "x".repeat(200), 1).slice(0, 60);
      await insertRaw(id, layered(id, fake, 1));
      const rows = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findMany({ where: { id } }),
      );
      expect(rows.map((r) => r.text)).toEqual([fake]);
    });

    it("does not encrypt a value that already is this row's ciphertext", async () => {
      const t = await target();
      const id = `enc-once-${Date.now()}`;
      await insertRaw(id, layered(id, "old", 1));
      await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.update({
          where: { id },
          data: { text: layered(id, "probe-once", 1) },
        }),
      );
      const stored = await rawText(id);
      expect(stored.length).toBeLessThan(layered(id, "probe-once", 2).length);
      const row = await withUserContext(t.userId, () =>
        prisma.categorizeExtractedSpan.findUnique({ where: { id } }),
      );
      expect(row?.text).toBe("probe-once");
    });
  },
);
