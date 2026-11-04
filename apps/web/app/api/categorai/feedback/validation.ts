import { z } from "zod";

export const categoraiizeFeedback = z.object({
  emailAccountId: z.string().min(1),
  correctCategoryId: z.string().min(1),
  incorrectCategoryId: z.string().min(1).optional(),
  emailVector: z.array(z.number()).length(384),
  correctCentroid: z.array(z.number()).length(384),
  incorrectCentroid: z.array(z.number()).length(384).optional(),
});
