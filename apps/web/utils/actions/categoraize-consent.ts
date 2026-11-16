"use server";

import { after } from "next/server";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { recordAuditEvent } from "@/utils/categoraize/audit";
import {
  CATEGORAIZE_PRIVACY_VERSION,
  CATEGORAIZE_TERMS_VERSION,
  getActiveConsent,
} from "@/utils/categoraize/consent";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  acceptCategoraizeConsent,
  setExternalLlmConsent,
} from "./categoraize-consent.validation";

/**
 * FR-1.8: accepting the Terms and Privacy Notice (required) with the optional
 * external-LLM choice. Every change adds a row, so the history of choices is
 * kept; the newest row for the current versions is the active one.
 */
export const acceptCategoraizeConsentAction = actionClientUser
  .metadata({ name: "acceptCategoraizeConsent" })
  .inputSchema(acceptCategoraizeConsent)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { externalLlmEnabled },
    }) => {
      await prisma.categorizeUserConsent.create({
        data: {
          userId,
          termsVersion: CATEGORAIZE_TERMS_VERSION,
          privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
          acceptedAt: new Date(),
          externalLlmEnabled,
        },
      });
      await recordAuditEvent({
        eventType: "consent_accepted",
        userId,
        metadata: {
          termsVersion: CATEGORAIZE_TERMS_VERSION,
          privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
          externalLlmEnabled,
        },
      });
      logger.info("CategorAIze consent accepted", { externalLlmEnabled });
      // Mailbox watches are skipped until consent is given (FR-1.8); start them now.
      after(() =>
        ensureEmailAccountsWatched({ userIds: [userId], logger }).catch(
          (error) =>
            logger.error("Failed to start watches after consent", { error }),
        ),
      );
      return { accepted: true };
    },
  );

/** The optional external-LLM choice, changed later in Settings. */
export const setExternalLlmConsentAction = actionClientUser
  .metadata({ name: "setExternalLlmConsent" })
  .inputSchema(setExternalLlmConsent)
  .action(async ({ ctx: { userId, logger }, parsedInput: { enabled } }) => {
    const active = await getActiveConsent(userId);
    if (!active) {
      throw new SafeError(
        "Accept the Terms and Privacy Notice before changing this setting.",
      );
    }
    await prisma.categorizeUserConsent.create({
      data: {
        userId,
        termsVersion: CATEGORAIZE_TERMS_VERSION,
        privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
        acceptedAt: active.acceptedAt,
        externalLlmEnabled: enabled,
      },
    });
    await recordAuditEvent({
      eventType: "external_llm_toggled",
      userId,
      metadata: { enabled },
    });
    logger.info("External LLM consent changed", { enabled });
    return { externalLlmEnabled: enabled };
  });

/**
 * Withdraws consent (RA 10173). Every row is marked, so the app stops reading
 * the mailbox and asks for consent again; stored data is kept until the user
 * deletes the account.
 */
export const withdrawCategoraizeConsentAction = actionClientUser
  .metadata({ name: "withdrawCategoraizeConsent" })
  .action(async ({ ctx: { userId, logger } }) => {
    const { count } = await prisma.categorizeUserConsent.updateMany({
      where: { userId, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
    await recordAuditEvent({
      eventType: "consent_withdrawn",
      userId,
      metadata: { rows: count },
    });
    logger.info("CategorAIze consent withdrawn", { rows: count });
    return { withdrawn: true };
  });
