import "server-only";

import { randomUUID } from "node:crypto";
import type { Category } from "@/generated/prisma/client";
import { defaultCategory } from "@/utils/categories";
import { extractEmailAddress } from "@/utils/email";
import {
  applyCategoryFeedback,
  embedTexts,
  matchEmail,
} from "@/utils/categoraize/client";
import { isCategoraizeFeatureOn } from "@/utils/categoraize/features";
import { parseVector, toVectorLiteral } from "@/utils/categoraize/vectors";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { withAccountSql } from "@/utils/categoraize/tenant";

export const SENDER_CATEGORY_THRESHOLD = 0.35;
const MAX_EMAILS = 3;

type SenderEmails = { subject: string; snippet: string }[];

/**
 * Sentence-BERT replacement for LLM sender categorization (smart categories).
 * A sender is its address plus up to three recent subjects and snippets;
 * categories are matched by their learned centroid, or by their description
 * until a correction teaches one. "Other" is the fallback, never a match.
 */
export async function semanticCategorizeSenders({
  emailAccountId,
  senders,
  categories,
}: {
  emailAccountId: string;
  senders: { emailAddress: string; emails: SenderEmails }[];
  categories: Pick<Category, "name" | "description">[];
}): Promise<{ sender: string; category?: string }[]> {
  const candidates = await getCandidateCategories(emailAccountId, categories);
  if (!candidates.length) {
    return senders.map(({ emailAddress }) => ({ sender: emailAddress }));
  }

  const results: { sender: string; category?: string }[] = [];
  for (const { emailAddress, emails } of senders) {
    const match = await matchEmail({
      ...senderText(emailAddress, emails),
      candidates: candidates.map((category) => ({
        id: category.id,
        text: categoryText(category),
        centroid: category.centroid,
      })),
      threshold: SENDER_CATEGORY_THRESHOLD,
    });
    await saveSenderEmbedding(
      emailAccountId,
      normalizeSender(emailAddress),
      match.embedding,
    );
    const best = candidates.find(({ id }) => id === match.best?.id);
    results.push({ sender: emailAddress, category: best?.name });
  }
  return results;
}

export async function semanticCategorizeSender({
  emailAccountId,
  sender,
  previousEmails,
  categories,
}: {
  emailAccountId: string;
  sender: string;
  previousEmails: SenderEmails;
  categories: Pick<Category, "name" | "description">[];
}) {
  const [result] = await semanticCategorizeSenders({
    emailAccountId,
    senders: [{ emailAddress: sender, emails: previousEmails }],
    categories,
  });
  return result?.category ? { category: result.category } : null;
}

/**
 * Rocchio on a manual recategorization: the new category's centroid moves
 * toward the sender, the old one away. Learned once per (sender, category);
 * failures are logged and never block the user's change.
 */
export async function learnSenderCategoryCorrection({
  emailAccountId,
  sender,
  fromCategoryId,
  toCategoryId,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  fromCategoryId: string | null;
  toCategoryId: string;
  logger: Logger;
}) {
  if (!isCategoraizeFeatureOn("smartCategories")) return;
  if (fromCategoryId === toCategoryId) return;

  try {
    const senderKey = normalizeSender(sender);
    const senderRow = await getSenderEmbedding(emailAccountId, senderKey);
    if (!senderRow?.embedding || senderRow.learnedCategoryId === toCategoryId) {
      return;
    }

    const categories = await withAccountSql(
      prisma,
      emailAccountId,
      (db) => db.$queryRaw<
        Array<{
          id: string;
          name: string;
          description: string | null;
          centroid: string | null;
        }>
      >`
      SELECT c."id", c."name", c."description", sc."centroid"::text AS "centroid"
      FROM "Category" c
      LEFT JOIN "CategorizeSenderCategoryCentroid" sc ON sc."categoryId" = c."id"
      WHERE c."emailAccountId" = ${emailAccountId}
        AND c."id" IN (${toCategoryId}, ${fromCategoryId ?? toCategoryId})
    `,
    );
    const target = categories.find(({ id }) => id === toCategoryId);
    if (!target) return;
    const previous = fromCategoryId
      ? categories.find(({ id }) => id === fromCategoryId)
      : undefined;

    const feedback = await applyCategoryFeedback({
      embedding: senderRow.embedding,
      correct: { id: target.id, centroid: await centroidOf(target) },
      incorrect:
        previous && previous.name !== defaultCategory.OTHER.name
          ? { id: previous.id, centroid: await centroidOf(previous) }
          : null,
    });

    await saveCentroid(
      emailAccountId,
      feedback.correct.id,
      feedback.correct.centroid,
    );
    if (feedback.incorrect) {
      await saveCentroid(
        emailAccountId,
        feedback.incorrect.id,
        feedback.incorrect.centroid,
      );
    }
    await prisma.categorizeSenderEmbedding.update({
      where: { emailAccountId_sender: { emailAccountId, sender: senderKey } },
      data: { learnedCategoryId: toCategoryId },
    });
    logger.info("Learned sender category correction");
  } catch (error) {
    logger.warn("Could not learn from sender category correction", { error });
  }
}

async function getCandidateCategories(
  emailAccountId: string,
  categories: Pick<Category, "name" | "description">[],
) {
  const names = categories
    .map(({ name }) => name)
    .filter((name) => name !== defaultCategory.OTHER.name);
  if (!names.length) return [];
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<
      Array<{
        id: string;
        name: string;
        description: string | null;
        centroid: string | null;
      }>
    >`
    SELECT c."id", c."name", c."description", sc."centroid"::text AS "centroid"
    FROM "Category" c
    LEFT JOIN "CategorizeSenderCategoryCentroid" sc ON sc."categoryId" = c."id"
    WHERE c."emailAccountId" = ${emailAccountId} AND c."name" = ANY(${names})
    ORDER BY c."name" ASC
  `,
  );
  return rows.map((row) => ({ ...row, centroid: parseVector(row.centroid) }));
}

async function centroidOf(category: {
  name: string;
  description: string | null;
  centroid: string | null;
}) {
  return (
    parseVector(category.centroid) ??
    (await embedTexts([categoryText(category)]))[0]
  );
}

async function getSenderEmbedding(emailAccountId: string, sender: string) {
  const rows = await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$queryRaw<
      Array<{ embedding: string | null; learnedCategoryId: string | null }>
    >`
    SELECT "embedding"::text AS "embedding", "learnedCategoryId"
    FROM "CategorizeSenderEmbedding"
    WHERE "emailAccountId" = ${emailAccountId} AND "sender" = ${sender}
  `,
  );
  const row = rows[0];
  return row ? { ...row, embedding: parseVector(row.embedding) } : null;
}

async function saveSenderEmbedding(
  emailAccountId: string,
  sender: string,
  embedding: number[],
) {
  await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$executeRaw`
    INSERT INTO "CategorizeSenderEmbedding" ("id", "updatedAt", "sender", "embedding", "emailAccountId")
    VALUES (${randomUUID()}, CURRENT_TIMESTAMP, ${sender}, ${toVectorLiteral(embedding)}::vector, ${emailAccountId})
    ON CONFLICT ("emailAccountId", "sender") DO UPDATE
    SET "embedding" = EXCLUDED."embedding", "updatedAt" = CURRENT_TIMESTAMP
  `,
  );
}

async function saveCentroid(
  emailAccountId: string,
  categoryId: string,
  centroid: number[],
) {
  await withAccountSql(
    prisma,
    emailAccountId,
    (db) => db.$executeRaw`
    INSERT INTO "CategorizeSenderCategoryCentroid" ("id", "updatedAt", "centroid", "centroidVersion", "categoryId", "emailAccountId")
    VALUES (${randomUUID()}, CURRENT_TIMESTAMP, ${toVectorLiteral(centroid)}::vector, 1, ${categoryId}, ${emailAccountId})
    ON CONFLICT ("categoryId") DO UPDATE
    SET "centroid" = EXCLUDED."centroid",
        "centroidVersion" = "CategorizeSenderCategoryCentroid"."centroidVersion" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
  `,
  );
}

function normalizeSender(sender: string) {
  return (extractEmailAddress(sender) || sender).trim().toLowerCase();
}

function senderText(sender: string, emails: SenderEmails) {
  const recent = emails.slice(0, MAX_EMAILS);
  return {
    subject: sender,
    body: recent.length
      ? recent
          .map(({ subject, snippet }) => `${subject}. ${snippet}`)
          .join("\n")
      : sender,
  };
}

function categoryText(category: { name: string; description: string | null }) {
  return category.description
    ? `${category.name}: ${category.description}`
    : category.name;
}
