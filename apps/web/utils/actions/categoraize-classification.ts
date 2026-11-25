"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { applyLearnedLabels } from "@/utils/categoraize/label-examples";
import { categoraizeInputFromMessage } from "@/utils/categoraize/message-input";
import {
  classifyAndStoreEmail,
  previewCategoraizeEmail,
  reclassifyStoredEmail,
} from "@/utils/categoraize/process-email";
import {
  acceptCategoraizeCategory,
  classifyRecentCategoraizeEmails,
  correctCategoraizeCategory,
  previewCategoraizeClassification,
  rateCategoraizePriority,
  reclassifyStoredCategoraizeEmails,
  removeCategoraizeLabelExample,
  setCategoraizeManualPriority,
  teachCategoraizeLabel,
} from "./categoraize-classification.validation";

/**
 * Scenario 5: a category correction teaches the labels. The corrected email
 * becomes an example of its new label (and stops being one of the old), each
 * label's centroid is rebuilt from its description and examples (this account
 * only), and unreviewed emails are re-sorted. Each (email, target label) pair
 * is recorded once in FeedbackEvent.
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
    const correct = await prisma.categorizeCategory.findFirst({
      where: { id: categoryId, emailAccountId, isActive: true },
      select: { id: true, name: true },
    });
    if (!correct) throw new SafeError("Category not found");

    const learned = await recordLabelExample({
      emailAccountId,
      classificationId,
      fromCategoryId: classification.categoryId,
      toCategoryId: correct.id,
    });

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
    const { moved } = await applyLearnedLabels({
      emailAccountId,
      logger,
      maxRescore: RESCORE_AFTER_CORRECTION,
    });

    revalidateCategoraize(emailAccountId);
    return { learned, moved };
  });

/**
 * Teach a label by example: the chosen emails go into the label as reviewed
 * examples, the label centroids are rebuilt, and the rest of the inbox is
 * re-sorted. Examples never leave this account.
 */
export const teachCategoraizeLabelAction = actionClient
  .metadata({ name: "teachCategoraizeLabel" })
  .inputSchema(teachCategoraizeLabel)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    requireEnabled();
    const label = await prisma.categorizeCategory.findFirst({
      where: { id: parsedInput.categoryId, emailAccountId, isActive: true },
      select: { id: true, name: true },
    });
    if (!label) throw new SafeError("Label not found");

    const emails = await prisma.categorizeClassification.findMany({
      where: { id: { in: parsedInput.classificationIds }, emailAccountId },
      select: { id: true, categoryId: true },
    });
    if (!emails.length) throw new SafeError("Pick at least one email");

    for (const email of emails) {
      await recordLabelExample({
        emailAccountId,
        classificationId: email.id,
        fromCategoryId: email.categoryId,
        toCategoryId: label.id,
      });
      await prisma.categorizeClassification.update({
        where: { id: email.id },
        data: {
          categoryId: label.id,
          categoryName: label.name,
          isReviewedByUser: true,
        },
      });
    }
    for (const email of emails) {
      await reclassifyStoredEmail({
        emailAccountId,
        classificationId: email.id,
        logger,
      }).catch((error) =>
        logger.warn("Re-score of a taught example failed", {
          classificationId: email.id,
          error,
        }),
      );
    }
    const result = await applyLearnedLabels({
      emailAccountId,
      logger,
      maxRescore: RESCORE_AFTER_TEACH,
    });

    revalidateCategoraize(emailAccountId);
    return { examples: emails.length, ...result };
  });

/** Stop using an email as an example: it returns to automatic sorting. */
export const removeCategoraizeLabelExampleAction = actionClient
  .metadata({ name: "removeCategoraizeLabelExample" })
  .inputSchema(removeCategoraizeLabelExample)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    requireEnabled();
    const result = await prisma.categorizeClassification.updateMany({
      where: {
        id: parsedInput.classificationId,
        emailAccountId,
        isReviewedByUser: true,
      },
      data: { isReviewedByUser: false },
    });
    if (result.count === 0) throw new SafeError("That email is not an example");
    await applyLearnedLabels({
      emailAccountId,
      logger,
      maxRescore: RESCORE_AFTER_CORRECTION,
    });
    revalidateCategoraize(emailAccountId);
  });

const RESCORE_AFTER_CORRECTION = 10;
const RESCORE_AFTER_TEACH = 40;

/** One FeedbackEvent per (email, label); returns false if it was already recorded. */
async function recordLabelExample({
  emailAccountId,
  classificationId,
  fromCategoryId,
  toCategoryId,
}: {
  emailAccountId: string;
  classificationId: string;
  fromCategoryId: string | null;
  toCategoryId: string;
}) {
  try {
    await prisma.categorizeFeedbackEvent.create({
      data: { emailAccountId, classificationId, fromCategoryId, toCategoryId },
    });
    return true;
  } catch (error) {
    if (isDuplicateError(error)) return false;
    throw error;
  }
}

/** Accepting a prediction marks it reviewed, which makes it an example of its label. */
export const acceptCategoraizeCategoryAction = actionClient
  .metadata({ name: "acceptCategoraizeCategory" })
  .inputSchema(acceptCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const result = await prisma.categorizeClassification.updateMany({
      where: {
        id: parsedInput.classificationId,
        emailAccountId,
        categoryId: { not: null },
      },
      data: { isReviewedByUser: true },
    });
    if (result.count === 0) throw new SafeError("Nothing to accept");
    await applyLearnedLabels({
      emailAccountId,
      logger,
      maxRescore: RESCORE_AFTER_CORRECTION,
    });
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
