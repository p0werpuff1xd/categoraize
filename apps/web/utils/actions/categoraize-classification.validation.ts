import { z } from "zod";

export const reviewCategoraiizeClassification = z.object({
  classificationId: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  correction: z.string().trim().max(500).optional(),
  feedback: z
    .object({
      emailVector: z.array(z.number()).length(384),
      correctCentroid: z.array(z.number()).length(384),
      incorrectCategoryId: z.string().min(1).optional(),
      incorrectCentroid: z.array(z.number()).length(384).optional(),
    })
    .optional(),
});
