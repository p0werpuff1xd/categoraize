import "server-only";

import prisma from "@/utils/prisma";
import { withAccountSql } from "@/utils/categoraize/tenant";

// Prisma cannot read or write pgvector columns (Unsupported("vector(384)")),
// so every vector goes through raw SQL as its text form "[x,y,...]".

export async function getCategoryVectors(emailAccountId: string) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        basePriority: number;
        threshold: number;
        centroid: string | null;
        original: string | null;
      }>
    >`
    SELECT "id", "name", "description", "basePriority",
           "classificationThreshold" AS "threshold",
           "centroidEmbedding"::text AS "centroid",
           "originalEmbedding"::text AS "original"
    FROM "CategorizeCategory"
    WHERE "emailAccountId" = ${emailAccountId} AND "isActive" = true
    ORDER BY "name" ASC
  `,
  );

  return rows.map((row) => ({
    ...row,
    centroid: parseVector(row.centroid),
    original: parseVector(row.original),
  }));
}

export async function getClassificationEmbedding(
  classificationId: string,
  emailAccountId: string,
) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT "embedding"::text AS "embedding"
    FROM "CategorizeClassification"
    WHERE "id" = ${classificationId} AND "emailAccountId" = ${emailAccountId}
  `,
  );
  return parseVector(rows[0]?.embedding ?? null);
}

export async function setClassificationEmbedding(
  classificationId: string,
  embedding: number[],
  emailAccountId: string,
) {
  await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$executeRaw`
    UPDATE "CategorizeClassification"
    SET "embedding" = ${toVectorLiteral(embedding)}::vector
    WHERE "id" = ${classificationId} AND "emailAccountId" = ${emailAccountId}
  `,
  );
}

/** Store a fresh description embedding; it also becomes the centroid until feedback moves it. */
export async function setCategoryDescriptionEmbedding({
  categoryId,
  emailAccountId,
  embedding,
  resetCentroid,
}: {
  categoryId: string;
  emailAccountId: string;
  embedding: number[];
  resetCentroid: boolean;
}) {
  const vector = toVectorLiteral(embedding);
  await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$executeRaw`
    UPDATE "CategorizeCategory"
    SET "originalEmbedding" = ${vector}::vector,
        "centroidEmbedding" = CASE WHEN ${resetCentroid} OR "centroidEmbedding" IS NULL
                                   THEN ${vector}::vector ELSE "centroidEmbedding" END,
        "centroidVersion" = CASE WHEN ${resetCentroid} THEN 0 ELSE "centroidVersion" END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${categoryId} AND "emailAccountId" = ${emailAccountId}
  `,
  );
}

export async function setCategoryCentroid({
  categoryId,
  emailAccountId,
  centroid,
}: {
  categoryId: string;
  emailAccountId: string;
  centroid: number[];
}) {
  await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$executeRaw`
    UPDATE "CategorizeCategory"
    SET "centroidEmbedding" = ${toVectorLiteral(centroid)}::vector,
        "centroidVersion" = "centroidVersion" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${categoryId} AND "emailAccountId" = ${emailAccountId}
  `,
  );
}

/**
 * The mean embedding of a label's examples: the emails in this account the
 * user put in the label themselves (taught, corrected or confirmed). Stays
 * inside the account; nothing is shared across users.
 */
export async function getLabelExampleMean({
  categoryId,
  emailAccountId,
}: {
  categoryId: string;
  emailAccountId: string;
}) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ mean: string | null; count: bigint }>>`
    SELECT avg("embedding")::text AS "mean", count(*) AS "count"
    FROM "CategorizeClassification"
    WHERE "emailAccountId" = ${emailAccountId}
      AND "categoryId" = ${categoryId}
      AND "isReviewedByUser" = true
      AND "embedding" IS NOT NULL
  `,
  );
  return {
    mean: parseVector(rows[0]?.mean ?? null),
    count: Number(rows[0]?.count ?? 0),
  };
}

/** Fewer emails than this give no stable mean; matching then stays uncentred. */
export const MIN_BACKGROUND_EMAILS = 20;

/**
 * The mean embedding of this account's mail (its own emails only). Labels are
 * compared mean-centred against it, so what all email shares does not count
 * as a match. Null until the account has MIN_BACKGROUND_EMAILS emails.
 */
export async function getAccountBackground(emailAccountId: string) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ mean: string | null; count: bigint }>>`
    SELECT avg("embedding")::text AS "mean", count(*) AS "count"
    FROM "CategorizeClassification"
    WHERE "emailAccountId" = ${emailAccountId} AND "embedding" IS NOT NULL
  `,
  );
  if (Number(rows[0]?.count ?? 0) < MIN_BACKGROUND_EMAILS) return null;
  return parseVector(rows[0]?.mean ?? null);
}

/**
 * Re-sort the emails the user has not reviewed against the current label
 * centroids, in the database (cosine similarity, the service's own rule:
 * best label if it reaches that label's threshold, else Uncategorized).
 * Returns the ids whose label changed, so only those need a full re-score.
 */
export async function resortUnreviewedEmails({
  emailAccountId,
  background,
  threshold,
}: {
  emailAccountId: string;
  background: number[] | null;
  threshold: number;
}) {
  // Same rule as the service: the best label by (mean-centred) cosine, if it
  // reaches the threshold; otherwise Uncategorized.
  const shift = toVectorLiteral(
    background ?? new Array(VECTOR_DIMENSION).fill(0),
  );
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<
      Array<{ id: string; categoryId: string | null; categoryName: string | null }>
    >`
    WITH best AS (
      SELECT DISTINCT ON (c."id")
             c."id",
             k."id" AS "bestId",
             k."name" AS "bestName",
             1 - ((c."embedding" - ${shift}::vector) <=> (k."centroidEmbedding" - ${shift}::vector)) AS "similarity",
             c."categoryId" AS "currentId"
      FROM "CategorizeClassification" c
      JOIN "CategorizeCategory" k
        ON k."emailAccountId" = c."emailAccountId"
       AND k."isActive" = true
       AND k."centroidEmbedding" IS NOT NULL
      WHERE c."emailAccountId" = ${emailAccountId}
        AND c."isReviewedByUser" = false
        AND c."embedding" IS NOT NULL
      ORDER BY c."id",
               (c."embedding" - ${shift}::vector) <=> (k."centroidEmbedding" - ${shift}::vector)
    ),
    target AS (
      SELECT "id",
             CASE WHEN "similarity" >= ${threshold} THEN "bestId" END AS "categoryId",
             CASE WHEN "similarity" >= ${threshold} THEN "bestName" END AS "categoryName",
             "currentId"
      FROM best
    )
    UPDATE "CategorizeClassification" c
    SET "categoryId" = t."categoryId",
        "categoryName" = t."categoryName",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM target t
    WHERE c."id" = t."id"
      AND t."categoryId" IS DISTINCT FROM t."currentId"
    RETURNING c."id", c."categoryId", c."categoryName"
  `,
  );
  return rows;
}

const VECTOR_DIMENSION = 384;

export function toVectorLiteral(vector: number[]) {
  if (!vector.every(Number.isFinite)) {
    throw new Error("Vector contains non-finite values");
  }
  return `[${vector.join(",")}]`;
}

export function parseVector(value: string | null): number[] | null {
  if (!value) return null;
  return value
    .slice(1, -1)
    .split(",")
    .map((part) => Number(part));
}
