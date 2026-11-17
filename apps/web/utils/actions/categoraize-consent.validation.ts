import { z } from "zod";

export const setExternalLlmConsent = z.object({
  enabled: z.boolean(),
});

export const setPiiMasking = z.object({
  enabled: z.boolean(),
});

/** First-login consent: the Terms and Privacy Notice are required; external AI is optional. */
export const acceptCategoraizeConsent = z.object({
  acceptTerms: z.literal(true),
  externalLlmEnabled: z.boolean(),
});
