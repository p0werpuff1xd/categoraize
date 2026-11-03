import type { Logger } from "@/utils/logger";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import type { IntelligenceClassificationRequest } from "@/lib/categorai/intelligence-client";

export type CategoraiizeProcessingPayload =
  IntelligenceClassificationRequest & {
    emailAccountId: string;
    threadId: string;
    messageId: string;
  };

export type CategoraiizeCategoryEmbeddingPayload = {
  emailAccountId: string;
  categoryId: string;
  name: string;
  description?: string;
};

export async function enqueueCategoraiizeProcessing({
  payload,
  logger,
}: {
  payload: CategoraiizeProcessingPayload;
  logger: Logger;
}) {
  return enqueueBackgroundJob({
    topic: "categoraiize-processing",
    body: payload,
    qstash: {
      queueName: "categoraiize-processing",
      parallelism: 2,
      path: "/api/categorai/process",
      deduplicationId: `${payload.emailAccountId}:${payload.threadId}:${payload.messageId}`,
    },
    logger,
  });
}

export async function enqueueCategoraiizeCategoryEmbedding({
  payload,
  logger,
}: {
  payload: CategoraiizeCategoryEmbeddingPayload;
  logger: Logger;
}) {
  return enqueueBackgroundJob({
    topic: "categoraiize-category-embedding",
    body: payload,
    qstash: {
      queueName: "categoraiize-category-embedding",
      parallelism: 1,
      path: "/api/categorai/embed-category",
      headers: undefined,
      deduplicationId: `${payload.emailAccountId}:${payload.categoryId}`,
    },
    logger,
  });
}
