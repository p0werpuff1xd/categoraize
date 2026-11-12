import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { CategorizeContactRole } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  type CategoraizeClassifyRequest,
  type CategoraizeContactRoleLabel,
  type CategoraizeSpan,
  classifyEmail,
} from "@/utils/categoraize/client";
import {
  getCategoryVectors,
  setClassificationEmbedding,
} from "@/utils/categoraize/vectors";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";

const SNIPPET_CHARS = 240;
const CATEGORAIZE_SERVICE_VERSION = "0.2.0";

export type CategoraizeEmailInput = {
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
};

/**
 * Classify one email with the NLP service and store the result: category,
 * ranked similarities, priority with factors, TASK/DATE spans and the
 * email embedding. Re-running keeps spans the user confirmed and any
 * manual priority override.
 */
export async function classifyAndStoreEmail({
  emailAccountId,
  email,
  logger,
}: {
  emailAccountId: string;
  email: CategoraizeEmailInput;
  logger: Logger;
}) {
  const fromEmail = extractEmailAddress(email.from).toLowerCase() || email.from;
  const fromName = extractNameFromEmail(email.from);

  const [emailAccount, categories, contact, existing] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { timezone: true },
    }),
    getCategoryVectors(emailAccountId),
    prisma.categorizeContact.findUnique({
      where: { emailAccountId_email: { emailAccountId, email: fromEmail } },
      select: { role: true, isVip: true },
    }),
    prisma.categorizeClassification.findUnique({
      where: {
        emailAccountId_threadId_messageId: {
          emailAccountId,
          threadId: email.threadId,
          messageId: email.messageId,
        },
      },
      select: {
        categoryId: true,
        isReviewedByUser: true,
        spans: {
          where: { OR: [{ confirmed: true }, { dismissedAt: { not: null } }] },
          select: {
            confirmed: true,
            label: true,
            source: true,
            start: true,
            end: true,
            resolvedAt: true,
            dismissedAt: true,
          },
        },
      },
    }),
  ]);

  // Spans the user confirmed or dismissed keep that decision across re-scoring.
  const reviewedSpans = existing?.spans ?? [];
  // A category the user corrected stays put; the service only re-ranks and re-scores.
  const pinnedCategoryId =
    existing?.isReviewedByUser &&
    categories.some(({ id }) => id === existing.categoryId)
      ? existing.categoryId
      : null;
  const request: CategoraizeClassifyRequest = {
    email_id: email.messageId,
    subject: email.subject,
    body: email.body,
    received_at: email.receivedAt.toISOString(),
    timezone: emailAccount?.timezone || "UTC",
    sender: {
      email: fromEmail,
      role: contact?.role ? ROLE_LABELS[contact.role] : null,
      is_vip: contact?.isVip ?? false,
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description ?? "",
      base_priority: category.basePriority,
      centroid: category.centroid,
    })),
    threshold: categories.length
      ? Math.min(...categories.map((category) => category.threshold))
      : undefined,
    // Calendar busy periods arrive in Phase 6; until then no calendar boost is applied.
    calendar_busy: null,
    confirmed_deadlines: reviewedSpans
      .filter(
        (span) =>
          span.confirmed &&
          !span.dismissedAt &&
          span.label === "DATE" &&
          span.resolvedAt,
      )
      .map((span) => (span.resolvedAt as Date).toISOString()),
    pinned_category_id: pinnedCategoryId,
  };

  const result = await classifyEmail(request);
  const category = result.category
    ? categories.find(({ id }) => id === result.category?.id)
    : undefined;

  const data = {
    subject: email.subject,
    fromEmail,
    fromName: fromName === fromEmail ? null : fromName,
    snippet: email.body.slice(0, SNIPPET_CHARS),
    bodyText: email.body,
    receivedAt: email.receivedAt,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    confidence:
      result.category?.similarity ?? result.ranked[0]?.similarity ?? 0,
    rankedCategories: result.ranked as Prisma.InputJsonValue,
    suggestedLabel: (result.suggested_label ??
      undefined) as Prisma.InputJsonValue,
    computedPriority: result.priority.level,
    priorityFactors: result.priority.factors as Prisma.InputJsonValue,
    deadlineAt: result.priority.deadline
      ? new Date(result.priority.deadline)
      : null,
    detectedLang: result.language,
    actionDirective:
      result.spans.find((span) => span.label === "TASK")?.text ?? null,
    processingStatus: "COMPLETED",
    processingError: null,
    serviceVersion: CATEGORAIZE_SERVICE_VERSION,
  };

  const classification = await prisma.categorizeClassification.upsert({
    where: {
      emailAccountId_threadId_messageId: {
        emailAccountId,
        threadId: email.threadId,
        messageId: email.messageId,
      },
    },
    create: {
      ...data,
      emailAccountId,
      threadId: email.threadId,
      messageId: email.messageId,
      processingKey: `${email.threadId}:${email.messageId}`,
    },
    update: { ...data, suggestedLabel: data.suggestedLabel ?? null },
    select: { id: true },
  });

  await setClassificationEmbedding(classification.id, result.embedding);

  await prisma.categorizeExtractedSpan.deleteMany({
    where: { classificationId: classification.id },
  });
  if (result.spans.length > 0) {
    await prisma.categorizeExtractedSpan.createMany({
      data: result.spans.map((span) => {
        const previous = reviewedSpans.find(
          (reviewed) =>
            reviewed.label === span.label &&
            reviewed.source === span.source &&
            reviewed.start === span.start &&
            reviewed.end === span.end,
        );
        const confirmed = previous?.confirmed ?? false;
        return {
          classificationId: classification.id,
          emailAccountId,
          label: span.label,
          text: span.text,
          source: span.source,
          start: span.start,
          end: span.end,
          resolvedAt: spanResolvedAt(span, previous),
          ambiguous: confirmed ? false : span.ambiguous,
          isDeadline: span.is_deadline || confirmed,
          confirmed,
          dismissedAt: previous?.dismissedAt ?? null,
          tagger: span.tagger,
        };
      }),
    });
  }

  logger.info("CategorAIze classified email", {
    classificationId: classification.id,
    categoryId: category?.id ?? null,
    priority: result.priority.level,
    spanCount: result.spans.length,
    totalMs: result.timings_ms.total,
  });

  return { classificationId: classification.id, result };
}

/** Re-score a stored email, e.g. after a deadline is confirmed or a centroid moved. */
export async function reclassifyStoredEmail({
  emailAccountId,
  classificationId,
  logger,
}: {
  emailAccountId: string;
  classificationId: string;
  logger: Logger;
}) {
  const stored = await prisma.categorizeClassification.findFirst({
    where: { id: classificationId, emailAccountId },
    select: {
      threadId: true,
      messageId: true,
      subject: true,
      fromEmail: true,
      fromName: true,
      bodyText: true,
      receivedAt: true,
      createdAt: true,
    },
  });
  if (!stored) return null;

  return classifyAndStoreEmail({
    emailAccountId,
    logger,
    email: {
      threadId: stored.threadId,
      messageId: stored.messageId,
      subject: stored.subject ?? "",
      from: stored.fromName
        ? `${stored.fromName} <${stored.fromEmail ?? ""}>`
        : (stored.fromEmail ?? ""),
      body: stored.bodyText ?? "",
      receivedAt: stored.receivedAt ?? stored.createdAt,
    },
  });
}

const ROLE_LABELS: Record<CategorizeContactRole, CategoraizeContactRoleLabel> =
  {
    [CategorizeContactRole.DIRECT_REPORT]: "Direct Report",
    [CategorizeContactRole.MANAGER]: "Manager",
    [CategorizeContactRole.DIRECTOR_EXECUTIVE]: "Director/Executive",
    [CategorizeContactRole.EXTERNAL_VENDOR]: "External Vendor",
  };

function spanResolvedAt(
  span: CategoraizeSpan,
  previous: { confirmed: boolean; resolvedAt: Date | null } | undefined,
) {
  if (previous?.confirmed) return previous.resolvedAt;
  return span.resolved ? new Date(span.resolved) : null;
}
