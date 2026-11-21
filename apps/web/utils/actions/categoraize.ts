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
  clusterCentroid,
  findCategorySuggestions,
} from "@/utils/categoraize/discovery";
import { setCategoryCentroid } from "@/utils/categoraize/vectors";
import {
  createCategoraizeCategory,
  acceptDiscoveredCategory,
  createCategoryFromSuggestion,
  dismissDiscoveredCategories,
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

/** Category discovery: cluster Uncategorized emails into suggested categories (never created automatically). */
export const discoverCategoriesAction = actionClient
  .metadata({ name: "discoverCategoraizeCategories" })
  .inputSchema(z.object({}))
  .action(async ({ ctx: { emailAccountId } }) =>
    findCategorySuggestions(emailAccountId),
  );

/** The user confirms one suggested cluster (or several merged) as a new category. */
export const acceptDiscoveredCategoryAction = actionClient
  .metadata({ name: "acceptDiscoveredCategory" })
  .inputSchema(acceptDiscoveredCategory)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const memberIds = [
      ...new Set(parsedInput.clusters.flatMap((cluster) => cluster.memberIds)),
    ];
    const category = await createCategory({
      emailAccountId,
      name: parsedInput.name,
      description: null,
    });
    await embedCategoryDescription({
      emailAccountId,
      category,
      resetCentroid: true,
      logger,
    });
    // The confirmed cluster's centre is the category's starting centroid.
    const centroid = await clusterCentroid(emailAccountId, memberIds);
    if (centroid) {
      await setCategoryCentroid({
        categoryId: category.id,
        emailAccountId,
        centroid,
      });
    }
    await recordClusterDecisions(
      emailAccountId,
      parsedInput.clusters.map((cluster) => cluster.key),
      true,
    );
    const rescored = await rescoreClassifications({
      emailAccountId,
      where: { id: { in: memberIds } },
      logger,
    });

    revalidateCategoraize(emailAccountId);
    return { id: category.id, rescored };
  });

export const dismissDiscoveredCategoriesAction = actionClient
  .metadata({ name: "dismissDiscoveredCategories" })
  .inputSchema(dismissDiscoveredCategories)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    await recordClusterDecisions(emailAccountId, parsedInput.keys, false);
  });

async function recordClusterDecisions(
  emailAccountId: string,
  keys: string[],
  accepted: boolean,
) {
  await Promise.all(
    keys.map((key) =>
      prisma.categorizeProposalDecision.upsert({
        where: { emailAccountId_key: { emailAccountId, key } },
        create: { emailAccountId, key, accepted },
        update: { accepted },
      }),
    ),
  );
}
