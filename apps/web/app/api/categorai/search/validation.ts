import { z } from "zod";

export const categoraiizeSearch = z
  .object({
    query: z.string().trim().min(1).max(500).optional(),
    queryVector: z.array(z.number()).length(384).optional(),
    categoryId: z.string().min(1).optional(),
    minimumPriority: z.enum(["P1", "P2", "P3", "P4", "P5"]).optional(),
    hasDeadline: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
  })
  .refine((value) => value.query || value.queryVector, {
    message: "A query or queryVector is required",
  });
