import { z } from "zod";
import { env } from "@/env";

const scoreSchema = z.object({
  category: z.string(),
  score: z.number(),
});

const analysisSchema = z.object({
  email_id: z.string(),
  sbert: z.object({
    status: z.enum(["ready", "unavailable"]),
    category: z.string().nullable(),
    scores: z.array(scoreSchema),
    model_version: z.string().nullable(),
  }),
  passive_aggressive: z.object({
    status: z.enum(["ready", "unavailable"]),
    category: z.string().nullable(),
    trained_examples: z.number(),
    model_version: z.string().nullable(),
  }),
  bilstm_crf: z.object({
    status: z.enum(["ready", "unavailable"]),
    entities: z.array(
      z.object({
        text: z.string(),
        label: z.enum(["ACTION", "DEADLINE"]),
        start: z.number(),
        end: z.number(),
      }),
    ),
    model_version: z.string().nullable(),
  }),
  final_category: z.string().nullable(),
  priority: z.object({
    level: z.enum(["low", "normal", "high"]),
    explanation: z.string(),
  }),
  errors: z.array(z.string()),
});

export type NlpAnalysis = z.infer<typeof analysisSchema>;

export type NlpCategoryDescription = {
  name: string;
  description: string;
};

export async function analyzeEmailWithNlp({
  userId,
  emailId,
  subject,
  body,
  messageDate,
  categoryDescriptions,
}: {
  userId: string;
  emailId: string;
  subject: string;
  body: string;
  messageDate?: string;
  categoryDescriptions: NlpCategoryDescription[];
}): Promise<NlpAnalysis> {
  if (!env.NLP_SERVICE_URL || !env.NLP_SERVICE_TOKEN) {
    throw new Error("NLP service is not configured");
  }

  const response = await fetch(`${env.NLP_SERVICE_URL}/api/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      "X-Internal-Service-Token": env.NLP_SERVICE_TOKEN,
    },
    body: JSON.stringify({
      email_id: emailId,
      subject,
      body,
      message_date: messageDate,
      category_descriptions: categoryDescriptions,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`NLP service returned HTTP ${response.status}`);
  }

  return analysisSchema.parse(await response.json());
}

export async function submitNlpFeedback({
  userId,
  emailId,
  correctedCategory,
}: {
  userId: string;
  emailId: string;
  correctedCategory: string;
}) {
  if (!env.NLP_SERVICE_URL || !env.NLP_SERVICE_TOKEN) {
    throw new Error("NLP service is not configured");
  }

  const response = await fetch(`${env.NLP_SERVICE_URL}/api/v1/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
      "X-Internal-Service-Token": env.NLP_SERVICE_TOKEN,
    },
    body: JSON.stringify({
      email_id: emailId,
      corrected_category: correctedCategory,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`NLP feedback returned HTTP ${response.status}`);
  }

  return z
    .object({
      email_id: z.string(),
      corrected_category: z.string(),
      trained_examples: z.number(),
      model_version: z.string(),
    })
    .parse(await response.json());
}
