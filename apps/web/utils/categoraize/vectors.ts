import "server-only";

import prisma from "@/utils/prisma";

// Prisma cannot read or write pgvector columns (Unsupported("vector(384)")),
// so every vector goes through raw SQL as its text form "[x,y,...]".

export async function getCategoryVectors(emailAccountId: string) {
  const rows = await prisma.$queryRaw<
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
  `;

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
  const rows = await prisma.$queryRaw<Array<{ embedding: string | null }>>`
    SELECT "embedding"::text AS "embedding"
    FROM "CategorizeClassification"
    WHERE "id" = ${classificationId} AND "emailAccountId" = ${emailAccountId}
  `;
  return parseVector(rows[0]?.embedding ?? null);
}

export async function setClassificationEmbedding(
  classificationId: string,
  embedding: number[],
) {
  await prisma.$executeRaw`
    UPDATE "CategorizeClassification"
    SET "embedding" = ${toVectorLiteral(embedding)}::vector
    WHERE "id" = ${classificationId}
  `;
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
  await prisma.$executeRaw`
    UPDATE "CategorizeCategory"
    SET "originalEmbedding" = ${vector}::vector,
        "centroidEmbedding" = CASE WHEN ${resetCentroid} OR "centroidEmbedding" IS NULL
                                   THEN ${vector}::vector ELSE "centroidEmbedding" END,
        "centroidVersion" = CASE WHEN ${resetCentroid} THEN 0 ELSE "centroidVersion" END,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${categoryId} AND "emailAccountId" = ${emailAccountId}
  `;
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
  await prisma.$executeRaw`
    UPDATE "CategorizeCategory"
    SET "centroidEmbedding" = ${toVectorLiteral(centroid)}::vector,
        "centroidVersion" = "centroidVersion" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${categoryId} AND "emailAccountId" = ${emailAccountId}
  `;
}

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
