import { z } from "zod";

const categoryName = z.string().trim().min(1).max(100);
const categoryDescription = z.string().trim().max(2000).optional();

export const createCategoraiizeCategory = z.object({
  name: categoryName,
  description: categoryDescription,
});

export const updateCategoraiizeCategory = createCategoraiizeCategory.extend({
  categoryId: z.string().min(1),
  classificationThreshold: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});

export const deleteCategoraiizeCategory = z.object({
  categoryId: z.string().min(1),
});
