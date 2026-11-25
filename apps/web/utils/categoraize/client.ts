import "server-only";

import { z } from "zod";
import { env } from "@/env";
import { recordAuditEvent } from "@/utils/categoraize/audit";

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

const learnedPrioritySchema = z.object({
  level: z.number().int().min(1).max(5),
  model_level: z.number().int().min(1).max(5),
  category_offset: z.number().int(),
  why: z.array(z.object({ factor: z.string(), contribution: z.number() })),
  guardrails: z.array(z.string()),
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
  // Counts of numbers the service masked (it masks again as a safety net).
  pii_masked: z.record(z.string(), z.number()).optional(),
  // Absent from older services and null when no learned model is loaded.
  learned_priority: learnedPrioritySchema.nullish(),
  sender_register: z
    .object({
      value: z.enum(["formal", "neutral", "casual"]),
      source: z.enum(["learned", "rules"]),
    })
    .nullish(),
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
export type CategoraizeLearnedPriority = z.infer<typeof learnedPrioritySchema>;

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
    /** Canonical key for curated categories (e.g. "promotions"); null otherwise. */
    slug?: string | null;
  }>;
  threshold?: number;
  calendar_busy?: Array<{ start: string; end: string }> | null;
  confirmed_deadlines?: string[];
  now?: string;
  pinned_category_id?: string | null;
  /** False only for a user who turned PII masking off (IAS Phase 11 J). */
  mask_pii?: boolean;
};

export class CategoraizeServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "CategoraizeServiceError";
    this.status = status;
  }
}

/**
 * What to tell the user when a CategorAIze request fails, instead of the
 * generic "An unknown error occurred." Never includes the service's response
 * body (it can echo request text).
 */
export function categoraizeUserMessage(error: CategoraizeServiceError): string {
  if (error.message.includes("not enabled")) {
    return "Smart sorting is turned off for this workspace.";
  }
  if (error.status === undefined) {
    // Network failure or our 20-second timeout: usually the service scaling up.
    return "The sorting service took too long to respond. Please try again in a minute.";
  }
  if (error.status === 429) {
    return "The sorting service is busy. Please wait a moment and try again.";
  }
  if (error.status >= 500) {
    return "The sorting service had a problem. Please try again shortly.";
  }
  return "The sorting service could not process this request.";
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

const discoverResponseSchema = z.object({
  clusters: z.array(
    z.object({
      cluster_id: z.number().int(),
      member_ids: z.array(z.string()),
      centroid: vectorSchema,
      cohesion: z.number(),
    }),
  ),
  noise_ids: z.array(z.string()),
});

export type CategoraizeDiscovery = z.infer<typeof discoverResponseSchema>;

/** Cluster email vectors into candidate categories. Only ids and vectors are sent, never text. */
export async function discoverClusters(request: {
  vectors: Array<{ id: string; vector: number[] }>;
  minClusterSize: number;
}) {
  return callService(
    "/api/v1/discover",
    { vectors: request.vectors, min_cluster_size: request.minClusterSize },
    discoverResponseSchema,
  );
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
    if (response.status === 401) {
      // A wrong or missing internal key: counted for the weekly audit review.
      await recordAuditEvent({
        eventType: "nlp_auth_failure_count",
        metadata: { count: 1, path },
      });
    }
    const detail = await response.text().catch(() => "");
    throw new CategoraizeServiceError(
      `CategorAIze service returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  return schema.parse(await response.json());
}
