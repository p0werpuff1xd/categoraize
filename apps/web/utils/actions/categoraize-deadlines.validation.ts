import { z } from "zod";

export const confirmCategoraizeDeadline = z.object({
  spanId: z.string().min(1),
  // The user may correct an ambiguous date while confirming it.
  resolvedAt: z.string().datetime({ offset: true }).optional(),
});

export const dismissCategoraizeSpan = z.object({
  spanId: z.string().min(1),
});
