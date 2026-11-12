import { z } from "zod";

export const categoraizeSearch = z.object({
  query: z.string().trim().min(1).max(500),
  categoryId: z.string().min(1).optional(),
  minimumPriority: z.number().int().min(1).max(5).optional(),
  hasDeadline: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export type CategoraizeSearchBody = z.infer<typeof categoraizeSearch>;
