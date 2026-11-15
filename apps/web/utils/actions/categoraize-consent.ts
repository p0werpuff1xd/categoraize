"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import {
  CATEGORAIZE_PRIVACY_VERSION,
  CATEGORAIZE_TERMS_VERSION,
} from "@/utils/categoraize/consent";
import prisma from "@/utils/prisma";
import { setExternalLlmConsent } from "./categoraize-consent.validation";

/**
 * The optional external-LLM choice (FR-1.8). Every change adds a consent row,
 * so the history of choices is kept; the newest row is the active one.
 */
export const setExternalLlmConsentAction = actionClientUser
  .metadata({ name: "setExternalLlmConsent" })
  .inputSchema(setExternalLlmConsent)
  .action(async ({ ctx: { userId, logger }, parsedInput: { enabled } }) => {
    await prisma.categorizeUserConsent.create({
      data: {
        userId,
        termsVersion: CATEGORAIZE_TERMS_VERSION,
        privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
        acceptedAt: new Date(),
        externalLlmEnabled: enabled,
      },
    });
    logger.info("External LLM consent changed", { enabled });
    return { externalLlmEnabled: enabled };
  });
