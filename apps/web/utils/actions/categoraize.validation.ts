import { z } from "zod";

const categoryName = z.string().trim().min(1).max(100);
const categoryDescription = z.string().trim().max(2000).optional();
const basePriority = z.number().int().min(1).max(5);

export const createCategoraizeCategory = z.object({
  name: categoryName,
  description: categoryDescription,
  basePriority: basePriority.optional(),
});

export const updateCategoraizeCategory = z.object({
  categoryId: z.string().min(1),
  name: categoryName.optional(),
  description: categoryDescription,
  basePriority: basePriority.optional(),
  classificationThreshold: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});

export const deleteCategoraizeCategory = z.object({
  categoryId: z.string().min(1),
});

export const createCategoryFromSuggestion = z.object({
  classificationId: z.string().min(1),
});

export const upsertCategoraizeContact = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().max(200).optional(),
  role: z
    .enum(["DIRECT_REPORT", "MANAGER", "DIRECTOR_EXECUTIVE", "EXTERNAL_VENDOR"])
    .nullable(),
  isVip: z.boolean(),
});

export const acceptDiscoveredCategory = z.object({
  name: z.string().trim().min(1).max(60),
  // One or more suggested clusters; several means the user merged them.
  clusters: z
    .array(
      z.object({
        key: z.string().min(1),
        memberIds: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(20),
});

export const dismissDiscoveredCategories = z.object({
  keys: z.array(z.string().startsWith("cluster:")).min(1).max(50),
});
