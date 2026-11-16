import "server-only";

import { z } from "zod";
import { env } from "@/env";

const VECTOR_DIMENSION = 384;
const REQUEST_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 3000;

const vectorSchema = z.array(z.number()).length(VECTOR_DIMENSION);

const embedResponseSchema = z.object({
  model: z.string(),
  dimension: z.literal(VECTOR_DIMENSION),
  vectors: z.array(vectorSchema),
});

const categoryMatchSchema = z.object({
  id: z.string(),
  similarity: z.number(),
});

const spanSchema = z.object({
  label: z.enum(["TASK", "DATE"]),
  text: z.string(),
  source: z.enum(["subject", "body"]),
  start: z.number().int(),
  end: z.number().int(),
  resolved: z.string().nullable(),
  ambiguous: z.boolean(),
  is_deadline: z.boolean(),
  tagger: z.enum(["regex", "bilstm_crf"]),
});

const priorityFactorsSchema = z.object({
  category_base: z.number().int(),
  deadline: z.number().int(),
  sender_role: z.number().int(),
  calendar: z.number().int(),
  vip_pin: z.number().int(),
});

const classifyResponseSchema = z.object({
  email_id: z.string(),
  language: z.enum(["en", "tl", "mixed", "unknown"]),
  category: categoryMatchSchema.nullable(),
  ranked: z.array(categoryMatchSchema),
  threshold: z.number(),
  suggested_label: z
    .object({
      key: z.string(),
      name: z.string(),
      description: z.string(),
      similarity: z.number(),
    })
    .nullable(),
  spans: z.array(spanSchema),
  priority: z.object({
    level: z.number().int().min(1).max(5),
    factors: priorityFactorsSchema,
    deadline: z.string().nullable(),
  }),
  embedding: vectorSchema,
  timings_ms: z.record(z.string(), z.number()),
});

const centroidOutputSchema = z.object({
  id: z.string(),
  centroid: vectorSchema,
});

const feedbackResponseSchema = z.object({
  correct: centroidOutputSchema,
  incorrect: centroidOutputSchema.nullable(),
  alpha: z.number(),
  beta: z.number(),
});

const matchResponseSchema = z.object({
  ranked: z.array(categoryMatchSchema),
  best: categoryMatchSchema.nullable(),
  threshold: z.number(),
  embedding: vectorSchema,
  has_task: z.boolean(),
  timings_ms: z.record(z.string(), z.number()),
});

const summarizeResponseSchema = z.object({
  sentences: z.array(z.string()),
  method: z.string(),
});

const chooseRuleResponseSchema = z.object({
  ranked: z.array(categoryMatchSchema),
  matched: z.array(z.string()),
  confident: z.boolean(),
  reasons: z.array(z.string()),
  has_request: z.boolean(),
  params: z.record(z.string(), z.number()),
});

const threadStatusResponseSchema = z.object({
  status: z.enum(["TO_REPLY", "AWAITING_REPLY", "FYI", "ACTIONED"]),
  confident: z.boolean(),
  reason: z.string(),
  signals: z.record(z.string(), z.boolean()),
});

export type CategoraizeMatch = z.infer<typeof matchResponseSchema>;
export type CategoraizeClassification = z.infer<typeof classifyResponseSchema>;
export type CategoraizeSpan = z.infer<typeof spanSchema>;
export type CategoraizePriorityFactors = z.infer<typeof priorityFactorsSchema>;

export type CategoraizeContactRoleLabel =
  | "Direct Report"
  | "Manager"
  | "Director/Executive"
  | "External Vendor";

export type CategoraizeClassifyRequest = {
  email_id: string;
  subject: string;
  body: string;
  received_at: string;
  timezone: string;
  sender: {
    email: string;
    role: CategoraizeContactRoleLabel | null;
    is_vip: boolean;
  };
  categories: Array<{
    id: string;
    name: string;
    description: string;
    base_priority: number;
    centroid: number[] | null;
  }>;
  threshold?: number;
  calendar_busy?: Array<{ start: string; end: string }> | null;
  confirmed_deadlines?: string[];
  now?: string;
  pinned_category_id?: string | null;
};

export class CategoraizeServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "CategoraizeServiceError";
    this.status = status;
  }
}

export function isCategoraizeEnabled(): boolean {
  return Boolean(
    env.CATEGORAIZE_ENABLED &&
      env.CATEGORAIZE_SERVICE_URL &&
      env.CATEGORAIZE_INTERNAL_KEY,
  );
}

export type CategoraizeServiceStatus =
  | "disabled"
  | "ready"
  | "loading"
  | "unavailable";

export async function getCategoraizeServiceStatus(): Promise<CategoraizeServiceStatus> {
  if (!isCategoraizeEnabled()) return "disabled";
  try {
    const response = await fetch(`${env.CATEGORAIZE_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.ok) return "ready";
    const body = (await response.json().catch(() => null)) as {
      status?: string;
    } | null;
    return response.status === 503 && body?.status === "loading"
      ? "loading"
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function embedTexts(
  texts: string[],
  options?: { gloss?: boolean },
) {
  const result = await callService(
    "/api/v1/embed",
    { texts, gloss: options?.gloss ?? false },
    embedResponseSchema,
  );
  return result.vectors;
}

export async function classifyEmail(request: CategoraizeClassifyRequest) {
  return callService("/api/v1/classify", request, classifyResponseSchema);
}

export async function applyCategoryFeedback({
  embedding,
  correct,
  incorrect,
}: {
  embedding: number[];
  correct: { id: string; centroid: number[] };
  incorrect: { id: string; centroid: number[] } | null;
}) {
  return callService(
    "/api/v1/feedback",
    { embedding, correct, incorrect },
    feedbackResponseSchema,
  );
}

/** Sentence-BERT zero-shot match of an email (or sender) against free-text descriptions. */
export async function matchEmail(request: {
  subject: string;
  body: string;
  candidates: Array<{ id: string; text?: string; centroid?: number[] | null }>;
  threshold?: number;
}) {
  return callService("/api/v1/match", request, matchResponseSchema);
}

/** Rule matching with a confidence verdict (the service's tuned settings). */
export async function chooseRuleLocally(request: {
  subject: string;
  body: string;
  rules: Array<{
    id: string;
    name: string;
    instructions: string;
    reply_needed: boolean;
    system_type: string | null;
  }>;
  allowMultiple: boolean;
}) {
  return callService(
    "/api/v1/choose-rule",
    {
      subject: request.subject,
      body: request.body,
      rules: request.rules,
      allow_multiple: request.allowMultiple,
    },
    chooseRuleResponseSchema,
  );
}

/** Reply Zero status from tagger signals, with a confidence verdict. */
export async function threadStatusLocally(
  messages: Array<{
    from_user: boolean;
    subject: string;
    body: string;
    automated: boolean;
  }>,
) {
  return callService(
    "/api/v1/thread-status",
    { messages },
    threadStatusResponseSchema,
  );
}

/** Extractive summary: up to maxSentences original sentences. */
export async function summarizeEmail(request: {
  subject: string;
  body: string;
  maxSentences?: number;
}) {
  const result = await callService(
    "/api/v1/summarize",
    {
      subject: request.subject,
      body: request.body,
      max_sentences: request.maxSentences ?? 2,
    },
    summarizeResponseSchema,
  );
  return result.sentences;
}

async function callService<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!isCategoraizeEnabled()) {
    throw new CategoraizeServiceError("CategorAIze service is not enabled");
  }

  let response: Response;
  try {
    response = await fetch(`${env.CATEGORAIZE_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Internal-Key": env.CATEGORAIZE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new CategoraizeServiceError(
      `CategorAIze service is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new CategoraizeServiceError(
      `CategorAIze service returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  return schema.parse(await response.json());
}
