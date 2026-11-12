import type { Logger } from "@/utils/logger";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import type { ProcessCategoraizeMessage } from "@/app/api/categorai/process/validation";

export async function enqueueCategoraizeProcessing({
  payload,
  logger,
}: {
  payload: ProcessCategoraizeMessage;
  logger: Logger;
}) {
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
