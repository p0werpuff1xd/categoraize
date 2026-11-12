import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { createEmailProvider } from "@/utils/email/provider";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { categoraizeInputFromMessage } from "@/utils/categoraize/message-input";
import { classifyAndStoreEmail } from "@/utils/categoraize/process-email";
import { processCategoraizeMessage } from "./validation";

export const maxDuration = 60;

export const POST = withError(
  "categorai/process",
  withQstashOrInternal(async (request) => {
    if (!isCategoraizeEnabled()) {
      return NextResponse.json({ skipped: "disabled" });
    }

    const body = processCategoraizeMessage.parse(await request.json());
    const logger = request.logger.with({
      emailAccountId: body.emailAccountId,
      messageId: body.messageId,
    });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: body.emailAccountId },
      select: { account: { select: { provider: true } } },
    });
    if (!emailAccount) {
      return NextResponse.json({ skipped: "account-not-found" });
    }

    const provider = await createEmailProvider({
      emailAccountId: body.emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    });
    const message = await provider.getMessage(body.messageId);
    const { classificationId, result } = await classifyAndStoreEmail({
      emailAccountId: body.emailAccountId,
      email: categoraizeInputFromMessage(message),
      logger,
    });

    return NextResponse.json({
      classificationId,
      categoryId: result.category?.id ?? null,
      priority: result.priority.level,
    });
  }),
);
