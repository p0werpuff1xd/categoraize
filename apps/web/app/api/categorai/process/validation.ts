import { z } from "zod";

export const processCategoraizeMessage = z.object({
  emailAccountId: z.string().min(1),
  threadId: z.string().min(1),
  messageId: z.string().min(1),
});

export type ProcessCategoraizeMessage = z.infer<
  typeof processCategoraizeMessage
>;
