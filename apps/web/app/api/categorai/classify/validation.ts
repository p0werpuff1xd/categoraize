import { z } from "zod";

export const classifyRequest = z.object({
  emailVector: z.array(z.number()).min(1),
  categories: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      vector: z.array(z.number()).min(1),
    }),
  ),
  threshold: z.number().min(0).max(1).optional(),
  subject: z.string().default(""),
  body: z.string().default(""),
  messageAt: z.string().datetime().optional(),
  timezone: z.string().default("UTC"),
  priorityFactors: z.record(z.string(), z.number()).default({}),
});
