import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { embedTexts } from "@/utils/categoraize/client";
import { toVectorLiteral } from "@/utils/categoraize/vectors";
import { type CategoraizeSearchBody, categoraizeSearch } from "./validation";

export type CategoraizeSearchResponse = Awaited<ReturnType<typeof getData>>;

// POST because the query text can be long; this route only reads.
export const POST = withEmailAccount("categorai/search", async (request) => {
  const body = categoraizeSearch.parse(await request.json());
  return NextResponse.json(
    await getData({ emailAccountId: request.auth.emailAccountId, body }),
  );
});

async function getData({
  emailAccountId,
  body,
}: {
  emailAccountId: string;
  body: CategoraizeSearchBody;
}) {
  const [queryVector] = await embedTexts([body.query]);
  const vector = toVectorLiteral(queryVector);
  const filters = [
    Prisma.sql`c."emailAccountId" = ${emailAccountId}`,
    Prisma.sql`c."embedding" IS NOT NULL`,
  ];
  if (body.categoryId) {
    filters.push(Prisma.sql`c."categoryId" = ${body.categoryId}`);
  }
  if (body.minimumPriority) {
    filters.push(
      Prisma.sql`COALESCE(c."manualPriority", c."computedPriority") >= ${body.minimumPriority}`,
    );
  }
  if (body.hasDeadline !== undefined) {
    filters.push(
      body.hasDeadline
        ? Prisma.sql`c."deadlineAt" IS NOT NULL`
        : Prisma.sql`c."deadlineAt" IS NULL`,
    );
  }

  const results = await prisma.$queryRaw<
    Array<{
      id: string;
      threadId: string;
      messageId: string;
      subject: string | null;
      fromEmail: string | null;
      categoryId: string | null;
      categoryName: string | null;
      priority: number;
      deadlineAt: Date | null;
      similarity: number;
    }>
  >`
    SELECT c."id", c."threadId", c."messageId", c."subject", c."fromEmail",
           c."categoryId", c."categoryName",
           COALESCE(c."manualPriority", c."computedPriority") AS "priority",
           c."deadlineAt",
           1 - (c."embedding" <=> ${vector}::vector) AS "similarity"
    FROM "CategorizeClassification" c
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY c."embedding" <=> ${vector}::vector ASC
    LIMIT ${body.limit}
    OFFSET ${body.offset}
  `;

  return { results };
}
