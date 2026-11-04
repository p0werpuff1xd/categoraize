import { z } from "zod";

export const embedCategoraiizeCategory = z.object({
  emailAccountId: z.string().min(1),
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
});
