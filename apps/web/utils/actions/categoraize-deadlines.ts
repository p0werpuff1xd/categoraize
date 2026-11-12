"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { reclassifyStoredEmail } from "@/utils/categoraize/process-email";
import {
  confirmCategoraizeDeadline,
  dismissCategoraizeSpan,
} from "./categoraize-deadlines.validation";

/** Confirmed deadlines count toward priority even when the tagger flagged them ambiguous. */
export const confirmCategoraizeDeadlineAction = actionClient
  .metadata({ name: "confirmCategoraizeDeadline" })
  .inputSchema(confirmCategoraizeDeadline)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const span = await prisma.categorizeExtractedSpan.findFirst({
      where: { id: parsedInput.spanId, emailAccountId, label: "DATE" },
      select: { id: true, resolvedAt: true, classificationId: true },
    });
    if (!span) throw new SafeError("Deadline not found");

    const resolvedAt = parsedInput.resolvedAt
      ? new Date(parsedInput.resolvedAt)
      : span.resolvedAt;
    if (!resolvedAt) throw new SafeError("Pick a date for this deadline");

    await prisma.categorizeExtractedSpan.update({
      where: { id: span.id },
      data: {
        resolvedAt,
        confirmed: true,
        ambiguous: false,
        isDeadline: true,
        dismissedAt: null,
      },
    });

    if (isCategoraizeEnabled()) {
      await reclassifyStoredEmail({
        emailAccountId,
        classificationId: span.classificationId,
        logger,
      });
    }

    revalidatePath(prefixPath(emailAccountId, "/categoraize"), "layout");
  });

export const dismissCategoraizeSpanAction = actionClient
  .metadata({ name: "dismissCategoraizeSpan" })
  .inputSchema(dismissCategoraizeSpan)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const result = await prisma.categorizeExtractedSpan.updateMany({
      where: { id: parsedInput.spanId, emailAccountId },
      data: { dismissedAt: new Date() },
    });
    if (result.count === 0) throw new SafeError("Item not found");

    revalidatePath(prefixPath(emailAccountId, "/categoraize"), "layout");
  });
