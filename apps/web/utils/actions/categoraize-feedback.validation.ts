import { z } from "zod";

export const answerPriorityProposal = z.object({
  key: z.string().min(1).max(400),
  accept: z.boolean(),
});
