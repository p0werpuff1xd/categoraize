import { z } from "zod";

export const correctCategoraizeCategory = z.object({
  classificationId: z.string().min(1),
  categoryId: z.string().min(1),
});

export const setCategoraizeManualPriority = z.object({
  classificationId: z.string().min(1),
  // null resets to the computed priority
  priority: z.number().int().min(1).max(5).nullable(),
});

export const classifyRecentCategoraizeEmails = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export const reclassifyStoredCategoraizeEmails = z.object({
  limit: z.number().int().min(1).max(500).default(200),
});
