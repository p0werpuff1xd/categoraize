"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { rescoreClassifications } from "@/utils/categoraize/rescore";
import { actionClient } from "@/utils/actions/safe-action";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { embedCategoryDescription } from "@/utils/categoraize/categories";
import { reclassifyStoredEmail } from "@/utils/categoraize/process-email";
import {
  createCategoraizeCategory,
  createCategoryFromSuggestion,
  deleteCategoraizeCategory,
  updateCategoraizeCategory,
  upsertCategoraizeContact,
} from "./categoraize.validation";

const suggestedLabelSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
});

export const createCategoraizeCategoryAction = actionClient
  .metadata({ name: "createCategoraizeCategory" })
  .inputSchema(createCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const category = await createCategory({
      emailAccountId,
      name: parsedInput.name,
      description: parsedInput.description ?? null,
      basePriority: parsedInput.basePriority,
    });
    const embedded = await embedCategoryDescription({
      emailAccountId,
      category,
      resetCentroid: true,
      logger,
    });

    revalidateCategoraize(emailAccountId);
    return { id: category.id, embedded };
  });

export const updateCategoraizeCategoryAction = actionClient
  .metadata({ name: "updateCategoraizeCategory" })
  .inputSchema(updateCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const { categoryId, ...data } = parsedInput;
    const existing = await prisma.categorizeCategory.findFirst({
      where: { id: categoryId, emailAccountId },
      select: { name: true, description: true },
    });
    if (!existing) throw new SafeError("Category not found");

    let updated: { id: string; name: string; description: string | null };
    try {
      updated = await prisma.categorizeCategory.update({
        where: { id: categoryId },
        data,
        select: { id: true, name: true, description: true },
      });
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        throw new SafeError("A category with this name already exists");
      }
      throw error;
    }

    const textChanged =
      updated.name !== existing.name ||
      (updated.description ?? "") !== (existing.description ?? "");
    let embedded = false;
    if (textChanged) {
      // A new description defines a new category meaning, so the learned centroid restarts from it.
      embedded = await embedCategoryDescription({
        emailAccountId,
        category: updated,
        resetCentroid: true,
        logger,
      });
    }

    revalidateCategoraize(emailAccountId);
    return { embedded };
  });

export const deleteCategoraizeCategoryAction = actionClient
  .metadata({ name: "deleteCategoraizeCategory" })
  .inputSchema(deleteCategoraizeCategory)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeCategory.deleteMany({
      where: { id: parsedInput.categoryId, emailAccountId },
    });
    if (result.count === 0) throw new SafeError("Category not found");

    revalidateCategoraize(emailAccountId);
  });

/** Scenario 2: the user approves a suggested label, which then becomes a real category. */
export const createCategoryFromSuggestionAction = actionClient
  .metadata({ name: "createCategoryFromSuggestion" })
  .inputSchema(createCategoryFromSuggestion)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const classification = await prisma.categorizeClassification.findFirst({
      where: { id: parsedInput.classificationId, emailAccountId },
      select: { suggestedLabel: true },
    });
    const suggestion = suggestedLabelSchema.safeParse(
      classification?.suggestedLabel,
    );
    if (!suggestion.success) throw new SafeError("No suggested label");

    const category = await createCategory({
      emailAccountId,
      name: suggestion.data.name,
      description: suggestion.data.description,
    });
    await embedCategoryDescription({
      emailAccountId,
      category,
      resetCentroid: true,
      logger,
    });
    await reclassifyStoredEmail({
      emailAccountId,
      classificationId: parsedInput.classificationId,
      logger,
    });
    // Every other Uncategorized email with the same suggestion gets a chance
    // to match the new label.
    const rescored = await rescoreClassifications({
      emailAccountId,
      where: {
        categoryId: null,
        id: { not: parsedInput.classificationId },
        suggestedLabel: { path: ["key"], equals: suggestion.data.key },
      },
      logger,
    });

    revalidateCategoraize(emailAccountId);
    return { id: category.id, rescored: rescored + 1 };
  });

export const upsertCategoraizeContactAction = actionClient
  .metadata({ name: "upsertCategoraizeContact" })
  .inputSchema(upsertCategoraizeContact)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const { email, ...data } = parsedInput;
    await prisma.categorizeContact.upsert({
      where: { emailAccountId_email: { emailAccountId, email } },
      create: { emailAccountId, email, ...data },
      update: data,
    });
    // Role and VIP feed the priority rules, so this sender's emails are re-scored.
    const rescored = await rescoreClassifications({
      emailAccountId,
      where: { fromEmail: { equals: email, mode: "insensitive" } },
      logger,
    });
    revalidateCategoraize(emailAccountId);
    return { rescored };
  });

async function createCategory({
  emailAccountId,
  name,
  description,
  basePriority,
}: {
  emailAccountId: string;
  name: string;
  description: string | null;
  basePriority?: number;
}) {
  try {
    return await prisma.categorizeCategory.create({
      data: { emailAccountId, name, description, basePriority },
      select: { id: true, name: true, description: true },
    });
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      throw new SafeError("A category with this name already exists");
    }
    throw error;
  }
}

function revalidateCategoraize(emailAccountId: string) {
  revalidatePath(prefixPath(emailAccountId, "/categoraize"), "layout");
}
