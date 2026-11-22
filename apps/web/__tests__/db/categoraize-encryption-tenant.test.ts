// Field encryption through the row-level-security tenant wrapper, against a
// real database (RUN_DB_TESTS=true, local Docker Postgres). Regression for the
// production error "CategorizeClassification.subject holds a value that is not
// ciphertext": the wrapper re-ran the encryption extension, so writes were
// encrypted twice and reads decrypted twice.
import { afterAll, describe, expect, it } from "vitest";
import prisma from "@/utils/prisma";
import { encryptField } from "@/utils/categoraize/field-encryption";
import { withUserContext } from "@/utils/categoraize/tenant";

const TABLE = "CategorizeExtractedSpan";
const created: string[] = [];

async function target() {
  const [row] = await prisma.$queryRaw<
    { id: string; emailAccountId: string; userId: string }[]
  >`SELECT c.id, c."emailAccountId", ea."userId" FROM "CategorizeClassification" c
     JOIN "EmailAccount" ea ON ea.id = c."emailAccountId" LIMIT 1`;
  if (!row)
    throw new Error("needs one CategorizeClassification row in the local DB");
  return row;
}

async function insertRaw(id: string, text: string) {
  const t = await target();
  await prisma.$executeRaw`INSERT INTO "CategorizeExtractedSpan"
    (id, "updatedAt", label, text, source, start, "end", "classificationId", "emailAccountId")
    VALUES (${id}, now(), 'TASK', ${text}, 'body', 0, 5, ${t.id}, ${t.emailAccountId})`;
  created.push(id);
  return t;
}

async function rawText(id: string) {
  const [row] = await prisma.$queryRaw<
    { text: string }[]
  >`SELECT text FROM "CategorizeExtractedSpan" WHERE id = ${id}`;
  return row.text;
}

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "field encryption through the tenant wrapper",
  () => {
    afterAll(async () => {
      if (created.length)
        await prisma.$executeRaw`DELETE FROM "CategorizeExtractedSpan" WHERE id = ANY(${created})`;
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
  },
);
