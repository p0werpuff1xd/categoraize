import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

/**
 * Field-level encryption for CategorAIze email text (IAS Phase 11 I).
 *
 * - AES-256-GCM, 12-byte random IV, 16-byte tag.
 * - One key per column, derived with HKDF-SHA256 from ENCRYPTION_MASTER_KEY
 *   (info = "<keyId>:<table>.<column>"), so a leaked column key exposes one
 *   column only.
 * - The table, column and row id are bound as additional authenticated data:
 *   a value copied to another row or column fails to decrypt.
 * - Stored format: e1:<keyId>:<iv>:<tag>:<ciphertext> (base64url parts).
 * - Fail closed: no key, a tampered value or plaintext where ciphertext is
 *   expected all throw instead of returning data.
 *
 * Keys come only from the environment: ENCRYPTION_MASTER_KEY (base64, at
 * least 32 bytes), ENCRYPTION_KEY_ID (default "k1"), and for rotation
 * ENCRYPTION_PREVIOUS_KEYS ("k0:<base64>,...", decryption only).
 */

const VERSION = "e1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from("categoraize-field-encryption-v1", "utf8");

export class FieldEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncryptionError";
  }
}

type KeyRing = { activeId: string; masters: Map<string, Buffer> };

let cachedRing: { source: string; ring: KeyRing } | null = null;
const columnKeys = new Map<string, Buffer>();

function parseMaster(id: string, base64: string): Buffer {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length < 32) {
    throw new FieldEncryptionError(
      `Encryption key ${id} must be at least 32 bytes (base64)`,
    );
  }
  return key;
}

export function loadKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const master = env.ENCRYPTION_MASTER_KEY;
  const activeId = (env.ENCRYPTION_KEY_ID || "k1").trim();
  const previous = env.ENCRYPTION_PREVIOUS_KEYS || "";
  const source = `${master}|${activeId}|${previous}`;
  if (cachedRing?.source === source) return cachedRing.ring;

  if (!master) {
    throw new FieldEncryptionError(
      "ENCRYPTION_MASTER_KEY is not set: refusing to read or write encrypted fields",
    );
  }
  if (!/^[A-Za-z0-9_-]{1,16}$/.test(activeId)) {
    throw new FieldEncryptionError("ENCRYPTION_KEY_ID is invalid");
  }
  const masters = new Map<string, Buffer>([
    [activeId, parseMaster(activeId, master)],
  ]);
  for (const entry of previous.split(",").filter(Boolean)) {
    const separator = entry.indexOf(":");
    if (separator < 1) {
      throw new FieldEncryptionError("ENCRYPTION_PREVIOUS_KEYS is malformed");
    }
    const id = entry.slice(0, separator).trim();
    if (id === activeId) continue;
    masters.set(id, parseMaster(id, entry.slice(separator + 1)));
  }
  const ring = { activeId, masters };
  cachedRing = { source, ring };
  columnKeys.clear();
  return ring;
}

function columnKey(
  ring: KeyRing,
  keyId: string,
  table: string,
  column: string,
) {
  const cacheKey = `${keyId}:${table}.${column}`;
  const cached = columnKeys.get(cacheKey);
  if (cached) return cached;
  const master = ring.masters.get(keyId);
  if (!master) {
    throw new FieldEncryptionError(`Unknown encryption key id ${keyId}`);
  }
  const key = Buffer.from(
    hkdfSync("sha256", master, HKDF_SALT, Buffer.from(cacheKey, "utf8"), 32),
  );
  columnKeys.set(cacheKey, key);
  return key;
}

function aad(table: string, column: string, rowId: string) {
  return Buffer.from(`${table}.${column}.${rowId}`, "utf8");
}

export function isEncryptedValue(value: string) {
  return value.startsWith(`${VERSION}:`);
}

export function encryptField({
  table,
  column,
  rowId,
  plaintext,
  env,
}: {
  table: string;
  column: string;
  rowId: string;
  plaintext: string;
  env?: NodeJS.ProcessEnv;
}): string {
  if (!rowId) throw new FieldEncryptionError("A row id is required to encrypt");
  const ring = loadKeyRing(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    columnKey(ring, ring.activeId, table, column),
    iv,
  );
  cipher.setAAD(aad(table, column, rowId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    ring.activeId,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptField({
  table,
  column,
  rowId,
  value,
  env,
}: {
  table: string;
  column: string;
  rowId: string;
  value: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const parts = value.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new FieldEncryptionError(
      `${table}.${column} holds a value that is not ciphertext`,
    );
  }
  const [, keyId, ivPart, tagPart, dataPart] = parts;
  const ring = loadKeyRing(env);
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new FieldEncryptionError(
      `${table}.${column} ciphertext is malformed`,
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      columnKey(ring, keyId, table, column),
      iv,
    );
    decipher.setAAD(aad(table, column, rowId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof FieldEncryptionError) throw error;
    throw new FieldEncryptionError(
      `${table}.${column} failed authentication (tampered, moved or wrong key)`,
    );
  }
}

/** Key id a stored value was encrypted with (for rotation). */
export function keyIdOf(value: string): string | null {
  const parts = value.split(":");
  return parts.length === 5 && parts[0] === VERSION ? parts[1] : null;
}

/** cuid-shaped id ("c" + 24 base-36 chars) so the AAD row id is known before insert. */
export function newRowId(): string {
  const bytes = randomBytes(24);
  let id = "c";
  for (const byte of bytes) id += (byte % 36).toString(36);
  return id;
}
