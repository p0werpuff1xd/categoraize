import type { Logger } from "@/utils/logger";
import { env } from "@/env";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import type { ProcessCategoraizeMessage } from "@/app/api/categorai/process/validation";

export async function enqueueCategoraizeProcessing({
  payload,
  logger,
}: {
  payload: ProcessCategoraizeMessage;
  logger: Logger;
}) {
  // When no QStash token is configured the fallback creates a self-calling
  // HTTP request via after(fetch()), which spawns an extra Vercel function
  // invocation per email. On Hobby that is pure waste. Process inline instead.
  if (!env.QSTASH_TOKEN && process.env.VERCEL === "1") {
    const { createEmailProvider } = await import("@/utils/email/provider");
    const { categoraizeInputFromMessage } = await import(
      "@/utils/categoraize/message-input"
    );
    const { classifyAndStoreEmail } = await import(
      "@/utils/categoraize/process-email"
    );

    const provider = await createEmailProvider({
      emailAccountId: payload.emailAccountId,
      provider: "google",
      logger,
    });
    const message = await provider.getMessage(payload.messageId);
    await classifyAndStoreEmail({
      emailAccountId: payload.emailAccountId,
      email: categoraizeInputFromMessage(message),
      logger,
    });
    return "inline";
  }

  return enqueueBackgroundJob({
    topic: "categoraize-processing",
    body: payload,
    qstash: {
      queueName: "categoraize-processing",
      parallelism: 2,
      path: "/api/categorai/process",
      deduplicationId: `${payload.emailAccountId}:${payload.threadId}:${payload.messageId}`,
    },
    logger,
  });
}
