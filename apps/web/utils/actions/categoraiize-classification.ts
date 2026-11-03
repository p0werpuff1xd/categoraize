"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { adaptWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { reviewCategoraiizeClassification } from "./categoraiize-classification.validation";

export const reviewCategoraiizeClassificationAction = actionClient
  .metadata({ name: "reviewCategoraiizeClassification" })
  .inputSchema(reviewCategoraiizeClassification)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    if (parsedInput.categoryId) {
      const category = await prisma.categorizeCategory.findFirst({
        where: { id: parsedInput.categoryId, emailAccountId, isActive: true },
        select: { id: true },
      });
      if (!category) throw new SafeError("Category not found");
    }

    if (parsedInput.feedback?.incorrectCategoryId) {
      const category = await prisma.categorizeCategory.findFirst({
        where: {
          id: parsedInput.feedback.incorrectCategoryId,
          emailAccountId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!category) throw new SafeError("Incorrect category not found");
    }

    const result = await prisma.categorizeClassification.updateMany({
      where: {
        id: parsedInput.classificationId,
        emailAccountId,
      },
      data: {
        categoryId: parsedInput.categoryId,
        isReviewedByUser: true,
        userCorrection: parsedInput.correction,
      },
    });
    if (result.count === 0) throw new SafeError("Classification not found");

    if (parsedInput.feedback) {
      if (!parsedInput.categoryId) {
        throw new SafeError("A corrected category is required for feedback");
      }
      const feedback = await adaptWithIntelligenceService({
        emailVector: parsedInput.feedback.emailVector,
        correctCentroid: parsedInput.feedback.correctCentroid,
        incorrectCentroid: parsedInput.feedback.incorrectCentroid,
      });
      const correctVector = `[${feedback.correct_centroid.join(",")}]`;

      await prisma.$executeRaw`
        UPDATE "CategorizeCategory"
        SET "centroidEmbedding" = ${correctVector}::vector,
            "centroidVersion" = "centroidVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${parsedInput.categoryId}
          AND "emailAccountId" = ${emailAccountId}
      `;

      if (
        parsedInput.feedback.incorrectCategoryId &&
        feedback.incorrect_centroid
      ) {
        const incorrectVector = `[${feedback.incorrect_centroid.join(",")}]`;
        await prisma.$executeRaw`
          UPDATE "CategorizeCategory"
          SET "centroidEmbedding" = ${incorrectVector}::vector,
              "centroidVersion" = "centroidVersion" + 1,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${parsedInput.feedback.incorrectCategoryId}
            AND "emailAccountId" = ${emailAccountId}
        `;
      }
    }

    revalidatePath(prefixPath(emailAccountId, "/inbox"));
    revalidatePath(prefixPath(emailAccountId, "/categoraiize/rules"));
  });
