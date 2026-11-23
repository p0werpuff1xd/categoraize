import { Prisma } from "@/generated/prisma/client";
import {
  decryptField,
  encryptField,
  FieldEncryptionError,
  isEncryptedValue,
  newRowId,
} from "@/utils/categoraize/field-encryption";
import {
  getTenantTransaction,
  withTenantSql,
} from "@/utils/categoraize/tenant";

/**
 * Prisma Client extension that encrypts CategorAIze email text at rest
 * (IAS Phase 11 I). Writes encrypt with the row id as associated data; reads
 * decrypt and throw on anything that fails authentication (fail closed).
 *
 * Not encrypted on purpose: fromEmail (sender lookups filter on it), the
 * pgvector embeddings (similarity search needs them), ids and enums.
 * Nested writes into these models are not supported (none exist); updateMany
 * on an encrypted column throws.
 */
export const ENCRYPTED_EMAIL_FIELDS = {
  categorizeClassification: {
    table: "CategorizeClassification",
    fields: ["subject", "snippet", "bodyText", "summary", "actionDirective"],
  },
  categorizeExtractedSpan: {
    table: "CategorizeExtractedSpan",
    fields: ["text"],
  },
} as const;

type ModelName = keyof typeof ENCRYPTED_EMAIL_FIELDS;
type Data = Record<string, unknown>;

function encryptData(model: ModelName, data: Data | undefined, rowId: string) {
  if (!data) return;
  const { table, fields } = ENCRYPTED_EMAIL_FIELDS[model];
  for (const column of fields) {
    const value = data[column];
    if (typeof value === "string") {
      data[column] = encryptField({ table, column, rowId, plaintext: value });
    } else if (
      value &&
      typeof value === "object" &&
      "set" in value &&
      typeof (value as { set: unknown }).set === "string"
    ) {
      (value as { set: string }).set = encryptField({
        table,
        column,
        rowId,
        plaintext: (value as { set: string }).set,
      });
    }
  }
}

function touchesEncrypted(model: ModelName, data: Data | undefined) {
  if (!data) return false;
  return ENCRYPTED_EMAIL_FIELDS[model].fields.some(
    (column) => data[column] !== undefined && data[column] !== null,
  );
}

export const encryptedEmailFields = Prisma.defineExtension((client) => {
  const base = client as unknown as Record<
    ModelName,
    {
      findUnique: (args: unknown) => Promise<{ id: string } | null>;
    }
  >;

  async function resolveId(model: ModelName, where: Data) {
    if (typeof where.id === "string") return where.id;
    // Row-level security hides rows from a lookup without a tenant (IAS
    // Phase 11 K). This hook runs before the tenant wrapper opens its
    // transaction, so open one here: a hidden row meant a null id and the
    // update was written in plaintext ("value that is not ciphertext").
    const tx = getTenantTransaction();
    const row = tx
      ? await (tx as unknown as typeof base)[model].findUnique({
          where,
          select: { id: true },
        })
      : await withTenantSql(base, (db) =>
          (db as unknown as typeof base)[model].findUnique({
            where,
            select: { id: true },
          }),
        );
    return row?.id ?? null;
  }

  /** Never let an encrypted column reach the database in plaintext. */
  function dropEncrypted(model: ModelName, data: Data) {
    for (const column of ENCRYPTED_EMAIL_FIELDS[model].fields) {
      delete data[column];
    }
  }

  // Decryption is bound to the row id. A select without it came back as raw
  // ciphertext, and re-scoring stored that ciphertext back as email text.
  function selectRowId(model: ModelName, args: { select?: Data } | undefined) {
    const select = args?.select;
    if (
      select &&
      !select.id &&
      ENCRYPTED_EMAIL_FIELDS[model].fields.some((column) => select[column])
    ) {
      select.id = true;
    }
  }

  const query: Record<string, Record<string, unknown>> = {};
  const result: Record<string, Record<string, unknown>> = {};

  for (const model of Object.keys(ENCRYPTED_EMAIL_FIELDS) as ModelName[]) {
    const { table, fields } = ENCRYPTED_EMAIL_FIELDS[model];

    const readWithRowId = ({
      args,
      query,
    }: {
      args: { select?: Data };
      query: Next;
    }) => {
      selectRowId(model, args);
      return query(args);
    };

    query[model] = {
      findUnique: readWithRowId,
      findUniqueOrThrow: readWithRowId,
      findFirst: readWithRowId,
      findFirstOrThrow: readWithRowId,
      findMany: readWithRowId,
      async create({ args, query }: { args: { data: Data }; query: Next }) {
        args.data.id ??= newRowId();
        encryptData(model, args.data, args.data.id as string);
        return query(args);
      },
      async createMany({
        args,
        query,
      }: {
        args: { data: Data | Data[] };
        query: Next;
      }) {
        const rows = Array.isArray(args.data) ? args.data : [args.data];
        for (const row of rows) {
          row.id ??= newRowId();
          encryptData(model, row, row.id as string);
        }
        return query(args);
      },
      async update({
        args,
        query,
      }: {
        args: { where: Data; data: Data };
        query: Next;
      }) {
        if (touchesEncrypted(model, args.data)) {
          const id = await resolveId(model, args.where);
          if (!id) {
            throw new FieldEncryptionError(
              `${table} row not found: refusing to write encrypted fields in plaintext`,
            );
          }
          encryptData(model, args.data, id);
        }
        return query(args);
      },
      async upsert({
        args,
        query,
      }: {
        args: { where: Data; create: Data; update: Data };
        query: Next;
      }) {
        args.create.id ??= newRowId();
        encryptData(model, args.create, args.create.id as string);
        if (touchesEncrypted(model, args.update)) {
          const id = await resolveId(model, args.where);
          // No visible row: the create branch runs (already encrypted).
          if (id) encryptData(model, args.update, id);
          else dropEncrypted(model, args.update);
        }
        return query(args);
      },
      async updateMany({ args, query }: { args: { data: Data }; query: Next }) {
        if (touchesEncrypted(model, args.data)) {
          throw new FieldEncryptionError(
            `updateMany cannot write encrypted ${table} fields; update rows one by one`,
          );
        }
        return query(args);
      },
    };

    const computed: Record<string, unknown> = {};
    for (const column of fields) {
      computed[column] = {
        needs: { id: true, [column]: true },
        compute(row: Record<string, string | null>) {
          const value = row[column];
          if (value === null || value === undefined) return value;
          const plain = decryptField({
            table,
            column,
            rowId: row.id as string,
            value,
          });
          // Rows written through the tenant wrapper before 2026-11-20 were
          // encrypted twice (see tenantContext); unwrap the second layer. It
          // must still authenticate, so tampering is caught as before.
          return isEncryptedValue(plain)
            ? decryptField({
                table,
                column,
                rowId: row.id as string,
                value: plain,
              })
            : plain;
        },
      };
    }
    result[model] = computed;
  }

  return client.$extends({ query, result } as never);
});

type Next = (args: unknown) => Promise<unknown>;
