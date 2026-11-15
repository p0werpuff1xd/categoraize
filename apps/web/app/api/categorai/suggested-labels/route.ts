import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CategoraizeSuggestedLabelsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "categorai/suggested-labels",
  async (request) =>
    NextResponse.json(await getData(request.auth.emailAccountId)),
);

type Suggestion = {
  key: string;
  name: string;
  description: string;
  similarity: number;
};

/**
 * Labels the service suggested for Uncategorized emails, grouped. They come
 * only from the curated template library and are never created without the
 * user's click.
 */
async function getData(emailAccountId: string) {
  const [rows, existing] = await Promise.all([
    prisma.categorizeClassification.findMany({
      where: {
        emailAccountId,
        categoryId: null,
        suggestedLabel: { not: Prisma.DbNull },
      },
      orderBy: { receivedAt: "desc" },
      take: 500,
      select: { id: true, subject: true, suggestedLabel: true },
    }),
    prisma.categorizeCategory.findMany({
      where: { emailAccountId },
      select: { name: true },
    }),
  ]);
  const existingNames = new Set(existing.map(({ name }) => name.toLowerCase()));

  const groups = new Map<
    string,
    Suggestion & { count: number; classificationId: string; examples: string[] }
  >();
  for (const row of rows) {
    const suggestion = row.suggestedLabel as Suggestion | null;
    if (!suggestion?.key || existingNames.has(suggestion.name.toLowerCase())) {
      continue;
    }
    const group = groups.get(suggestion.key);
    if (group) {
      group.count += 1;
      group.similarity = Math.max(group.similarity, suggestion.similarity);
      if (group.examples.length < 3 && row.subject)
        group.examples.push(row.subject);
    } else {
      groups.set(suggestion.key, {
        ...suggestion,
        count: 1,
        classificationId: row.id,
        examples: row.subject ? [row.subject] : [],
      });
    }
  }

  return {
    suggestions: [...groups.values()].sort((a, b) => b.count - a.count),
  };
}
