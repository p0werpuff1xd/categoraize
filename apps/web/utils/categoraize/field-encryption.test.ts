import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptField,
  encryptField,
  FieldEncryptionError,
  isEncryptedValue,
  keyIdOf,
  newRowId,
} from "./field-encryption";

const keyA = randomBytes(32).toString("base64");
const keyB = randomBytes(32).toString("base64");
const envA = {
  ENCRYPTION_MASTER_KEY: keyA,
  ENCRYPTION_KEY_ID: "k1",
} as NodeJS.ProcessEnv;
const where = {
  table: "CategorizeClassification",
  column: "bodyText",
  rowId: "crow1",
};
const body =
  "Hi team, paki-send ang final weekly report bukas. Call [PHONE] if needed.";

describe("field encryption (IAS Phase 11 I)", () => {
  it("stores ciphertext, not the text", () => {
    const stored = encryptField({ ...where, plaintext: body, env: envA });
    expect(isEncryptedValue(stored)).toBe(true);
    expect(stored).not.toContain("report");
    expect(stored.split(":")).toHaveLength(5);
    expect(keyIdOf(stored)).toBe("k1");
    expect(decryptField({ ...where, value: stored, env: envA })).toBe(body);
  });

  it("uses a fresh IV: the same text encrypts differently", () => {
    const a = encryptField({ ...where, plaintext: body, env: envA });
    const b = encryptField({ ...where, plaintext: body, env: envA });
    expect(a).not.toBe(b);
  });

  it("detects tampering with the ciphertext", () => {
    const stored = encryptField({ ...where, plaintext: body, env: envA });
    const parts = stored.split(":");
    const data = Buffer.from(parts[4], "base64url");
    data[0] ^= 0x01;
    parts[4] = data.toString("base64url");
    expect(() =>
      decryptField({ ...where, value: parts.join(":"), env: envA }),
    ).toThrow(FieldEncryptionError);
  });

  it("rejects a value moved to another row or column", () => {
    const stored = encryptField({ ...where, plaintext: body, env: envA });
    expect(() =>
      decryptField({ ...where, rowId: "crow2", value: stored, env: envA }),
    ).toThrow(FieldEncryptionError);
    expect(() =>
      decryptField({ ...where, column: "subject", value: stored, env: envA }),
    ).toThrow(FieldEncryptionError);
  });

  it("fails with the wrong key", () => {
    const stored = encryptField({ ...where, plaintext: body, env: envA });
    const wrong = {
      ENCRYPTION_MASTER_KEY: keyB,
      ENCRYPTION_KEY_ID: "k1",
    } as NodeJS.ProcessEnv;
    expect(() => decryptField({ ...where, value: stored, env: wrong })).toThrow(
      FieldEncryptionError,
    );
  });

  it("fails closed without a key and on plaintext", () => {
    expect(() =>
      encryptField({ ...where, plaintext: body, env: {} as NodeJS.ProcessEnv }),
    ).toThrow(/ENCRYPTION_MASTER_KEY/);
    expect(() => decryptField({ ...where, value: body, env: envA })).toThrow(
      /not ciphertext/,
    );
  });

  it("rotates: old values still decrypt with the previous key, new ones use the new id", () => {
    const old = encryptField({ ...where, plaintext: body, env: envA });
    const rotated = {
      ENCRYPTION_MASTER_KEY: keyB,
      ENCRYPTION_KEY_ID: "k2",
      ENCRYPTION_PREVIOUS_KEYS: `k1:${keyA}`,
    } as NodeJS.ProcessEnv;
    expect(decryptField({ ...where, value: old, env: rotated })).toBe(body);
    const fresh = encryptField({ ...where, plaintext: body, env: rotated });
    expect(keyIdOf(fresh)).toBe("k2");
    // After the old key is removed, old values can no longer be read.
    const newOnly = {
      ENCRYPTION_MASTER_KEY: keyB,
      ENCRYPTION_KEY_ID: "k2",
    } as NodeJS.ProcessEnv;
    expect(() => decryptField({ ...where, value: old, env: newOnly })).toThrow(
      /Unknown encryption key id k1/,
    );
  });

  it("rejects short keys", () => {
    const weak = {
      ENCRYPTION_MASTER_KEY: Buffer.alloc(16).toString("base64"),
    } as NodeJS.ProcessEnv;
    expect(() =>
      encryptField({ ...where, plaintext: body, env: weak }),
    ).toThrow(/at least 32 bytes/);
  });

  it("makes cuid-shaped row ids", () => {
    const id = newRowId();
    expect(id).toMatch(/^c[0-9a-z]{24}$/);
    expect(newRowId()).not.toBe(id);
  });

  it("stays well under 15 ms per record (5 fields, 5 KB body)", () => {
    const longBody = "Paki-check ang report bago bukas. ".repeat(150);
    const fields = [
      "subject",
      "snippet",
      "bodyText",
      "summary",
      "actionDirective",
    ];
    const records = 200;
    const started = performance.now();
    for (let index = 0; index < records; index++) {
      for (const column of fields) {
        const value = encryptField({
          table: where.table,
          column,
          rowId: `crow${index}`,
          plaintext: longBody,
          env: envA,
        });
        decryptField({
          table: where.table,
          column,
          rowId: `crow${index}`,
          value,
          env: envA,
        });
      }
    }
    const perRecordMs = (performance.now() - started) / records;
    // Printed for the Phase 11 report.
    console.info(
      `field encryption: ${perRecordMs.toFixed(3)} ms per record (encrypt + decrypt, 5 fields)`,
    );
    expect(perRecordMs).toBeLessThan(15);
  });
});
