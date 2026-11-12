import { z } from "zod";

export const updateCategoraiizeDeadline = z.object({
  deadlineId: z.string().min(1),
  dueDate: z.string().datetime().optional(),
});
