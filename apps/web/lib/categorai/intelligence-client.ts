import "server-only";

import { z } from "zod";
import { env } from "@/env";
import { scrubCategoraiizePii } from "@/utils/categorai/pii-scrubber";

const classificationResponseSchema = z.object({
  category_id: z.string().nullable(),
  category_name: z.string().nullable(),
  similarity: z.number(),
  threshold: z.number(),
  status: z.enum(["CLASSIFIED", "UNCATEGORIZED"]),
  ranked_matches: z.array(
    z.object({
      category_id: z.string(),
      similarity: z.number(),
      meets_threshold: z.boolean(),
    }),
  ),
  language: z.string(),
  summary: z.array(z.string()),
  instructions: z.array(
    z.object({
      source_text: z.string(),
      action: z.string(),
      confidence: z.number(),
    }),
  ),
  deadlines: z.array(
    z.object({
      source_text: z.string(),
      due_date: z.string().nullable(),
      confidence: z.number(),
      needs_review: z.boolean(),
    }),
  ),
  priority: z.object({
    level: z.string(),
    score: z.number(),
    factors: z.record(z.string(), z.number()),
    weights: z.record(z.string(), z.number()),
    dampener: z.number(),
  }),
});

const embeddingResponseSchema = z.object({
  model: z.string(),
  dimension: z.number().int().positive(),
  embeddings: z.array(z.array(z.number())),
});

const feedbackResponseSchema = z.object({
  correct_centroid: z.array(z.number()),
  incorrect_centroid: z.array(z.number()).nullable(),
  alpha: z.number(),
  beta: z.number(),
});

export type IntelligenceClassificationRequest = {
  email_vector: number[];
  categories: Array<{ id: string; name: string; vector: number[] }>;
  threshold?: number;
  subject?: string;
  body?: string;
  message_at?: string;
  timezone?: string;
  priority_factors?: Record<string, number>;
};

export type IntelligenceClassification = z.infer<
  typeof classificationResponseSchema
>;

export type IntelligenceEmbeddingResponse = z.infer<
  typeof embeddingResponseSchema
>;

export type IntelligenceFeedbackResponse = z.infer<
  typeof feedbackResponseSchema
>;

async function callIntelligenceService<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!env.NLP_SERVICE_URL) {
    throw new Error("NLP intelligence service is not configured");
  }

  const response = await fetch(`${env.NLP_SERVICE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(env.NLP_SERVICE_TOKEN
        ? { authorization: `Bearer ${env.NLP_SERVICE_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Intelligence service returned HTTP ${response.status}`);
  }

  return schema.parse(await response.json());
}

export async function embedWithIntelligenceService(
  texts: string[],
): Promise<IntelligenceEmbeddingResponse> {
  return callIntelligenceService(
    "/api/v1/embed",
    { texts: texts.map(scrubCategoraiizePii) },
    embeddingResponseSchema,
  );
}

export async function adaptWithIntelligenceService({
  emailVector,
  correctCentroid,
  incorrectCentroid,
}: {
  emailVector: number[];
  correctCentroid: number[];
  incorrectCentroid?: number[];
}): Promise<IntelligenceFeedbackResponse> {
  return callIntelligenceService(
    "/api/v1/feedback",
    {
      email_vector: emailVector,
      correct_centroid: correctCentroid,
      incorrect_centroid: incorrectCentroid,
    },
    feedbackResponseSchema,
  );
}

export async function classifyWithIntelligenceService(
  request: IntelligenceClassificationRequest,
): Promise<IntelligenceClassification> {
  return callIntelligenceService(
    "/api/v1/classify",
    {
      ...request,
      subject: scrubCategoraiizePii(request.subject ?? ""),
      body: scrubCategoraiizePii(request.body ?? ""),
    },
    classificationResponseSchema,
  );
}
