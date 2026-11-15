import { z } from "zod";

export const setExternalLlmConsent = z.object({
  enabled: z.boolean(),
});
