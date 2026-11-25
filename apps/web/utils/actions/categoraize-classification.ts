"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createEmailProvider } from "@/utils/email/provider";
import {
  applyCategoryFeedback,
  embedTexts,
  isCategoraizeEnabled,
} from "@/utils/categoraize/client";
import { categoryEmbeddingText } from "@/utils/categoraize/categories";
import { categoraizeInputFromMessage } from "@/utils/categoraize/message-input";
import {
  classifyAndStoreEmail,
  previewCategoraizeEmail,
  reclassifyStoredEmail,
} from "@/utils/categoraize/process-email";
import {
  getCategoryVectors,
  getClassificationEmbedding,
  setCategoryCentroid,
} from "@/utils/categoraize/vectors";
import {
  acceptCategoraizeCategory,
  classifyRecentCategoraizeEmails,
  correctCategoraizeCategory,
  previewCategoraizeClassification,
  rateCategoraizePriority,
  reclassifyStoredCategoraizeEmails,
  setCategoraizeManualPriority,
} from "./categoraize-classification.validation";

/**
 * Scenario 5: a category correction moves the Rocchio centroids
 * (correct +alpha*e, previous -beta*e). Each (email, target category) pair
 * is learned once; the unique FeedbackEvent key blocks duplicates.
 */
export const correctCategoraizeCategoryAction = actionClient
  .metadata({ name: "correctCategoraizeCategory" })
  .inputSchema(correctCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    requireEnabled();
    const { classificationId, categoryId } = parsedInput;

    const classification = await prisma.categorizeClassification.findFirst({
      where: { id: classificationId, emailAccountId },
      select: { categoryId: true },
    });
    if (!classification) throw new SafeError("Email not found");
    if (classification.categoryId === categoryId) {
      throw new SafeError("The email is already in this category");
    }

    const alreadyLearned = await prisma.categorizeFeedbackEvent.findUnique({
      where: {
        classificationId_toCategoryId: {
          classificationId,
          toCategoryId: categoryId,
        },
      },
      select: { id: true },
    });

    const categories = await getCategoryVectors(emailAccountId);
    const correct = categories.find(({ id }) => id === categoryId);
    if (!correct) throw new SafeError("Category not found");
    const previous = categories.find(
      ({ id }) => id === classification.categoryId,
    );

    if (!alreadyLearned) {
      const embedding = await getClassificationEmbedding(
        classificationId,
        emailAccountId,
      );
      if (!embedding) throw new SafeError("This email has no embedding yet");

      const correctCentroid =
        correct.centroid ??
        (await embedTexts([categoryEmbeddingText(correct)]))[0];
      const feedback = await applyCategoryFeedback({
        embedding,
        correct: { id: correct.id, centroid: correctCentroid },
        incorrect: previous?.centroid
          ? { id: previous.id, centroid: previous.centroid }
          : null,
      });

      try {
        await prisma.categorizeFeedbackEvent.create({
          data: {
            emailAccountId,
            classificationId,
            fromCategoryId: previous?.id ?? null,
            toCategoryId: correct.id,
          },
        });
      } catch (error) {
        // A concurrent correction already learned this pair; do not apply it twice.
        if (isDuplicateError(error)) {
          throw new SafeError("This correction was already applied");
        }
        throw error;
      }

      await setCategoryCentroid({
        categoryId: feedback.correct.id,
        emailAccountId,
        centroid: feedback.correct.centroid,
      });
      if (feedback.incorrect) {
        await setCategoryCentroid({
          categoryId: feedback.incorrect.id,
          emailAccountId,
          centroid: feedback.incorrect.centroid,
        });
      }
    }

    await prisma.categorizeClassification.update({
      where: { id: classificationId },
      data: {
        categoryId: correct.id,
        categoryName: correct.name,
        isReviewedByUser: true,
      },
    });
    // Re-score so the priority uses the corrected category's base priority.
    await reclassifyStoredEmail({ emailAccountId, classificationId, logger });

    revalidateCategoraize(emailAccountId);
    return { learned: !alreadyLearned };
  });

/** Accepting a prediction only marks it reviewed; Rocchio learns from corrections, not confirmations. */
export const acceptCategoraizeCategoryAction = actionClient
  .metadata({ name: "acceptCategoraizeCategory" })
  .inputSchema(acceptCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeClassification.updateMany({
      where: {
        id: parsedInput.classificationId,
        emailAccountId,
        categoryId: { not: null },
      },
      data: { isReviewedByUser: true },
    });
    if (result.count === 0) throw new SafeError("Nothing to accept");
    revalidateCategoraize(emailAccountId);
  });

/** A manual override is stored beside the computed value and logged; it never feeds Rocchio. */
export const setCategoraizeManualPriorityAction = actionClient
  .metadata({ name: "setCategoraizeManualPriority" })
  .inputSchema(setCategoraizeManualPriority)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const classification = await prisma.categorizeClassification.findFirst({
      where: { id: parsedInput.classificationId, emailAccountId },
      select: {
        id: true,
        fromEmail: true,
        computedPriority: true,
        categoryId: true,
      },
    });
    if (!classification) throw new SafeError("Email not found");

    await prisma.categorizeClassification.update({
      where: { id: classification.id },
      data: { manualPriority: parsedInput.priority },
    });
    await prisma.categorizePriorityOverrideLog.create({
      data: {
        emailAccountId,
        classificationId: classification.id,
        categoryId: classification.categoryId,
        sender: classification.fromEmail ?? "",
        computedPriority: classification.computedPriority,
        manualPriority: parsedInput.priority,
      },
    });

    revalidateCategoraize(emailAccountId);
  });

/** "Accurate / not accurate" feedback on the shown priority; logged only, nothing changes automatically. */
export const rateCategoraizePriorityAction = actionClient
  .metadata({ name: "rateCategoraizePriority" })
  .inputSchema(rateCategoraizePriority)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const classification = await prisma.categorizeClassification.findFirst({
      where: { id: parsedInput.classificationId, emailAccountId },
      select: {
        id: true,
        fromEmail: true,
        computedPriority: true,
        manualPriority: true,
        categoryId: true,
      },
    });
    if (!classification) throw new SafeError("Email not found");

    await prisma.categorizePriorityOverrideLog.create({
      data: {
        emailAccountId,
        classificationId: classification.id,
        categoryId: classification.categoryId,
        sender: classification.fromEmail ?? "",
        computedPriority: classification.computedPriority,
        manualPriority: classification.manualPriority,
        isAccurate: parsedInput.accurate,
      },
    });
  });

/** Backfill: classify the most recent inbox messages through the service. */
export const classifyRecentCategoraizeEmailsAction = actionClient
  .metadata({ name: "classifyRecentCategoraizeEmails" })
  .inputSchema(classifyRecentCategoraizeEmails)
  .action(
    async ({ ctx: { emailAccountId, provider, logger }, parsedInput }) => {
      requireEnabled();
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const messages = await emailProvider.getInboxMessages(parsedInput.limit);

      let classified = 0;
      let failed = 0;
      for (const message of messages) {
        try {
          await classifyAndStoreEmail({
            emailAccountId,
            email: categoraizeInputFromMessage(message),
            logger,
          });
          classified++;
        } catch (error) {
          failed++;
          logger.warn("CategorAIze backfill failed for a message", {
            messageId: message.id,
            error,
          });
        }
      }

      revalidateCategoraize(emailAccountId);
      return { classified, failed };
    },
  );

/** Re-score stored emails so centroid changes reach earlier mail (scenario 5). */
export const reclassifyStoredCategoraizeEmailsAction = actionClient
  .metadata({ name: "reclassifyStoredCategoraizeEmails" })
  .inputSchema(reclassifyStoredCategoraizeEmails)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    requireEnabled();
    const stored = await prisma.categorizeClassification.findMany({
      where: { emailAccountId, bodyText: { not: null } },
      orderBy: { receivedAt: "desc" },
      take: parsedInput.limit,
      select: { id: true },
    });

    // One slow or failed email (an NLP timeout while the service scales) used
    // to abort the whole run; retry it once, then skip it and carry on.
    let reclassified = 0;
    let failed = 0;
    for (const { id } of stored) {
      const ok = await retryOnce(() =>
        reclassifyStoredEmail({ emailAccountId, classificationId: id, logger }),
      );
      if (ok) reclassified++;
      else {
        failed++;
        logger.warn("Re-score skipped an email after a retry", {
          classificationId: id,
        });
      }
    }

    revalidateCategoraize(emailAccountId);
    return { reclassified, failed };
  });

/** Rules studio sandbox: classify pasted text without storing it. */
export const previewCategoraizeClassificationAction = actionClient
  .metadata({ name: "previewCategoraizeClassification" })
  .inputSchema(previewCategoraizeClassification)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    requireEnabled();
    return previewCategoraizeEmail({ emailAccountId, ...parsedInput });
  });

async function retryOnce(run: () => Promise<unknown>): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await run();
      return true;
    } catch {
      // fall through to the retry, then report the email as failed
    }
  }
  return false;
}

function requireEnabled() {
  if (!isCategoraizeEnabled()) {
    throw new SafeError(
      "The CategorAIze service is turned off (CATEGORAIZE_ENABLED).",
    );
  }
}

function revalidateCategoraize(emailAccountId: string) {
  revalidatePath(prefixPath(emailAccountId, "/categoraize"), "layout");
}
