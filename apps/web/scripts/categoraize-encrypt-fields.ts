// Encrypts CategorAIze email text at rest, or re-encrypts it under a new key
// (IAS Phase 11 I). Reads and writes with raw SQL so it can see values the
// Prisma extension would refuse (plaintext from before encryption, or
// ciphertext under an older key).
//
// From apps/web:
//   pnpm categoraize:encrypt-fields -- --backfill   # first run: encrypt plaintext rows
//   pnpm categoraize:encrypt-fields                 # rotation: re-encrypt rows not under ENCRYPTION_KEY_ID
//   pnpm categoraize:encrypt-fields -- --dry-run
//
// Rotation: set the new key as ENCRYPTION_MASTER_KEY + ENCRYPTION_KEY_ID and
// put the old one in ENCRYPTION_PREVIOUS_KEYS ("k1:<base64>"), run this, then
// remove the old key. Plaintext found without --backfill is an error (fail
// closed). Records an encryption_key_rotated audit event.

import { parseArgs } from "node:util";
import { Prisma } from "@/generated/prisma/client";
import {
  decryptField,
  encryptField,
  isEncryptedValue,
  keyIdOf,
  loadKeyRing,
} from "@/utils/categoraize/field-encryption";

// Maintenance runs as the database owner (DIRECT_URL): it must see every
// user's rows, which row-level security hides from the runtime role. Set it
// before env.ts and the Prisma client load: everything that imports them is
// loaded dynamically in main() (tsx runs this file as CommonJS, so no
// top-level await).
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

const BATCH = 200;

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

async function main() {
  const { default: prisma } = await import("@/utils/prisma");
  const { recordAuditEvent } = await import("@/utils/categoraize/audit");
  const { ENCRYPTED_EMAIL_FIELDS } = await import(
    "@/utils/categoraize/field-encryption-extension"
  );
  const { values } = parseArgs({
    options: {
      backfill: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const ring = loadKeyRing();
  const dryRun = values["dry-run"];
  const totals = { encrypted: 0, reencrypted: 0, unchanged: 0, rows: 0 };
  const started = Date.now();

  for (const { table, fields } of Object.values(ENCRYPTED_EMAIL_FIELDS)) {
    const columns = Prisma.join(
      fields.map((field) => Prisma.raw(`"${field}"`)),
    );
    let lastId = "";
    for (;;) {
      const rows = await prisma.$queryRaw<Array<Record<string, string | null>>>`
        SELECT "id", ${columns} FROM ${Prisma.raw(`"${table}"`)}
        WHERE "id" > ${lastId} ORDER BY "id" LIMIT ${BATCH}`;
      if (!rows.length) break;
      lastId = rows[rows.length - 1].id as string;

      for (const row of rows) {
        const rowId = row.id as string;
        const updates: Array<[string, string]> = [];
        for (const column of fields) {
          const value = row[column];
          if (value === null || value === undefined) continue;
          if (isEncryptedValue(value)) {
            if (keyIdOf(value) === ring.activeId) {
              totals.unchanged += 1;
              continue;
            }
            // Old key: verify (decrypt) then re-encrypt under the active key.
            const plaintext = decryptField({ table, column, rowId, value });
            updates.push([
              column,
              encryptField({ table, column, rowId, plaintext }),
            ]);
            totals.reencrypted += 1;
          } else {
            if (!values.backfill) {
              throw new Error(
                `${table}.${column} of row ${rowId} is plaintext; run with --backfill to encrypt existing rows`,
              );
            }
            updates.push([
              column,
              encryptField({ table, column, rowId, plaintext: value }),
            ]);
            totals.encrypted += 1;
          }
        }
        if (!updates.length || dryRun) continue;
        const sets = Prisma.join(
          updates.map(
            ([column, value]) =>
              Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`,
          ),
        );
        await prisma.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} SET ${sets} WHERE "id" = ${rowId}`;
        totals.rows += 1;
      }
    }
  }

  const seconds = Math.round((Date.now() - started) / 100) / 10;
  console.log(
    `${dryRun ? "[dry run] " : ""}key ${ring.activeId}: ${totals.encrypted} values encrypted, ${totals.reencrypted} re-encrypted, ${totals.unchanged} already current, ${totals.rows} rows written, ${seconds}s`,
  );
  // Read a sample back through the normal (extended) Prisma client: every
  // value must decrypt, which proves the app can read what was written.
  if (!dryRun) {
    const sample = await prisma.categorizeClassification.findMany({
      take: 50,
      select: { id: true, subject: true, bodyText: true },
    });
    const spans = await prisma.categorizeExtractedSpan.findMany({
      take: 50,
      select: { id: true, text: true },
    });
    console.log(
      `verified: ${sample.length} classifications and ${spans.length} spans decrypt through the app's client`,
    );
  }

  if (!dryRun && (totals.encrypted || totals.reencrypted)) {
    await recordAuditEvent({
      eventType: "encryption_key_rotated",
      metadata: {
        keyId: ring.activeId,
        mode: values.backfill ? "backfill" : "rotation",
        encrypted: totals.encrypted,
        reencrypted: totals.reencrypted,
        rows: totals.rows,
      },
    });
  }
}
