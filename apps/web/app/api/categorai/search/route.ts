import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { embedWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { categoraiizeSearch } from "./validation";

const priorityRank: Record<string, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

export const POST = withEmailAccount("categorai/search", async (request) => {
  const body = categoraiizeSearch.parse(await request.json());
  const queryVector =
    body.queryVector ??
    (await embedWithIntelligenceService([body.query ?? ""])).embeddings[0];
  if (!queryVector)
    return new Response("Unable to embed query", { status: 502 });
  const vector = `[${queryVector.join(",")}]`;
  const filters = [
    Prisma.sql`c."emailAccountId" = ${request.auth.emailAccountId}`,
  ];

  if (body.categoryId) {
    filters.push(Prisma.sql`c."categoryId" = ${body.categoryId}`);
  }

  if (body.minimumPriority) {
    const minimumPriority = priorityRank[body.minimumPriority];
    filters.push(
      Prisma.sql`CAST(SUBSTRING(c."priorityBand" FROM 2) AS INTEGER) >= ${minimumPriority}`,
    );
  }

  if (body.hasDeadline !== undefined) {
    filters.push(
      body.hasDeadline
        ? Prisma.sql`EXISTS (
            SELECT 1 FROM "CategorizeDeadlineAlert" d
            WHERE d."emailAccountId" = c."emailAccountId"
              AND d."threadId" = c."threadId"
              AND d."messageId" = c."messageId"
              AND d."status" NOT IN ('COMPLETED', 'DISMISSED')
          )`
        : Prisma.sql`NOT EXISTS (
            SELECT 1 FROM "CategorizeDeadlineAlert" d
            WHERE d."emailAccountId" = c."emailAccountId"
              AND d."threadId" = c."threadId"
              AND d."messageId" = c."messageId"
              AND d."status" NOT IN ('COMPLETED', 'DISMISSED')
          )`,
    );
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      threadId: string;
      messageId: string;
      categoryId: string | null;
      categoryName: string | null;
      priority: string;
      priorityBand: string;
      priorityScore: number;
      confidence: number;
      similarity: number;
    }>
  >`
    SELECT
      c."id" AS "id",
      c."threadId" AS "threadId",
      c."messageId" AS "messageId",
      c."categoryId" AS "categoryId",
      c."categoryName" AS "categoryName",
      c."priority" AS "priority",
      c."priorityBand" AS "priorityBand",
      c."priorityScore" AS "priorityScore",
      c."confidence" AS "confidence",
      1 - (c."embedding" <=> ${vector}::vector) AS "similarity"
    FROM "CategorizeClassification" c
    WHERE ${Prisma.join(filters, " AND ")}
      AND c."embedding" IS NOT NULL
    ORDER BY c."embedding" <=> ${vector}::vector ASC
    LIMIT ${body.limit}
    OFFSET ${body.offset}
  `;

  return NextResponse.json({ results: rows });
});
