import { z } from "zod";

export const processCategoraiizeMessage = z.object({
  emailAccountId: z.string().min(1),
  threadId: z.string().min(1),
  messageId: z.string().min(1),
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
