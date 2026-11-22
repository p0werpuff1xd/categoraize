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

export const rateCategoraizePriority = z.object({
  classificationId: z.string().min(1),
  accurate: z.boolean(),
});

export const classifyRecentCategoraizeEmails = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export const reclassifyStoredCategoraizeEmails = z.object({
  limit: z.number().int().min(1).max(500).default(200),
});

export const previewCategoraizeClassification = z.object({
  subject: z.string().max(2000).default(""),
  body: z.string().min(1, "Paste some email text").max(20_000),
  from: z.string().max(320).default(""),
});

export const acceptCategoraizeCategory = z.object({
  classificationId: z.string().min(1),
});
