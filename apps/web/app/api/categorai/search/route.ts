import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { embedTexts } from "@/utils/categoraize/client";
import { toVectorLiteral } from "@/utils/categoraize/vectors";
import { loadTriageRows } from "@/utils/categoraize/triage-rows";
import { withAccountSql } from "@/utils/categoraize/tenant";
import { type CategoraizeSearchBody, categoraizeSearch } from "./validation";

export type CategoraizeSearchResponse = Awaited<ReturnType<typeof getData>>;

// POST because the query text can be long; this route only reads.
export const POST = withEmailAccount("categorai/search", async (request) => {
  const body = categoraizeSearch.parse(await request.json());
  return NextResponse.json(
    await getData({ emailAccountId: request.auth.emailAccountId, body }),
  );
});

/**
 * Semantic search: the query is embedded with Sentence-BERT and compared with
 * each stored email embedding through pgvector (<=>), combined with the
 * label, priority and deadline filters. Returns full Priority Inbox rows,
 * best match first.
 */
async function getData({
  emailAccountId,
  body,
}: {
  emailAccountId: string;
  body: CategoraizeSearchBody;
}) {
  // Short Filipino queries match the language more than the topic, so the
  // service embeds a Filipino/Taglish query as its English gloss.
  const [queryVector] = await embedTexts([body.query], { gloss: true });
  const vector = toVectorLiteral(queryVector);
  const filters = [
    Prisma.sql`c."emailAccountId" = ${emailAccountId}`,
    Prisma.sql`c."embedding" IS NOT NULL`,
  ];
  if (body.categoryId === "uncategorized") {
    filters.push(Prisma.sql`c."categoryId" IS NULL`);
  } else if (body.categoryId) {
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

  const matches = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT c."id", 1 - (c."embedding" <=> ${vector}::vector) AS "similarity"
    FROM "CategorizeClassification" c
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY c."embedding" <=> ${vector}::vector ASC
    LIMIT ${body.limit}
    OFFSET ${body.offset}
  `,
  );

  const similarityById = new Map(
    matches.map((match) => [match.id, Number(match.similarity)]),
  );
  const rows = await loadTriageRows({
    emailAccountId,
    where: { id: { in: matches.map((match) => match.id) } },
    take: matches.length,
  });

  return {
    results: rows
      .map((row) => ({ ...row, similarity: similarityById.get(row.id) ?? 0 }))
      .sort((a, b) => b.similarity - a.similarity),
  };
}
