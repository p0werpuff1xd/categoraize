import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { CategorizeContactRole } from "@/generated/prisma/enums";
import { createScopedLogger, type Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getCalendarBusyForPriority } from "@/utils/categoraize/calendar-busy";
import { categorySlugFor } from "@/utils/categoraize/category-priority";
import { resolveMailboxTimezone } from "@/utils/categoraize/mailbox-timezone";
import { getLabelMatching } from "@/utils/categoraize/label-matching";
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
import { maskPii, totalMasked } from "@/utils/categoraize/pii";
import { withAccountContext } from "@/utils/categoraize/tenant";
import { isPiiMaskingEnabledForAccount } from "@/utils/categoraize/pii-settings";

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
export async function classifyAndStoreEmail(args: {
  emailAccountId: string;
  email: CategoraizeEmailInput;
  logger: Logger;
}) {
  // Row-level security: queue jobs, re-scoring and the seed script all act for
  // the account's owner (IAS Phase 11 K).
  return withAccountContext(args.emailAccountId, () =>
    classifyAndStoreEmailForTenant(args),
  );
}

async function classifyAndStoreEmailForTenant({
  emailAccountId,
  email: input,
  logger,
}: {
  emailAccountId: string;
  email: CategoraizeEmailInput;
  logger: Logger;
}) {
  let email = input;
  const fromEmail = extractEmailAddress(email.from).toLowerCase() || email.from;
  const fromName = extractNameFromEmail(email.from);

  // IAS Phase 11 J: mask phone, card and government ID numbers once, here, so
  // the stored subject/body/snippet, the spans and the NLP request all use the
  // same masked text (span offsets stay consistent).
  const maskingOn = await isPiiMaskingEnabledForAccount(emailAccountId);
  let piiMaskedCount = 0;
  if (maskingOn) {
    const subject = maskPii(email.subject);
    const body = maskPii(email.body);
    piiMaskedCount = totalMasked(subject.counts) + totalMasked(body.counts);
    email = { ...email, subject: subject.text, body: body.text };
  }

  const [context, existing] = await Promise.all([
    loadClassifyContext(emailAccountId, fromEmail),
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

  const { categories } = context;
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
    ...context.request,
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
    mask_pii: maskingOn,
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
    // Learned model + this label's base-priority offset + guardrails when the
    // service has a model; the rule level stays in the factors as a cross-check.
    computedPriority: result.learned_priority?.level ?? result.priority.level,
    priorityFactors: (result.learned_priority
      ? {
          ...result.priority.factors,
          learned: {
            ...result.learned_priority,
            rule_level: result.priority.level,
          },
        }
      : result.priority.factors) as Prisma.InputJsonValue,
    senderRegister: result.sender_register?.value ?? null,
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
      piiMaskedCount,
      emailAccountId,
      threadId: email.threadId,
      messageId: email.messageId,
      processingKey: `${email.threadId}:${email.messageId}`,
    },
    update: {
      ...data,
      suggestedLabel: data.suggestedLabel ?? null,
      // Re-scoring reads text that is already masked (count 0): keep the old count.
      ...(piiMaskedCount > 0 ? { piiMaskedCount } : {}),
    },
    select: { id: true },
  });

  await setClassificationEmbedding(
    classification.id,
    result.embedding,
    emailAccountId,
  );

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

/** Classify text without storing anything (the rules studio sandbox). */
export async function previewCategoraizeEmail({
  emailAccountId,
  subject,
  body,
  from,
}: {
  emailAccountId: string;
  subject: string;
  body: string;
  from: string;
}) {
  const fromEmail = extractEmailAddress(from).toLowerCase() || from;
  const context = await loadClassifyContext(emailAccountId, fromEmail);
  const maskingOn = await isPiiMaskingEnabledForAccount(emailAccountId);
  const maskedSubject = maskingOn ? maskPii(subject) : null;
  const maskedBody = maskingOn ? maskPii(body) : null;
  const result = await classifyEmail({
    email_id: "sandbox",
    subject: maskedSubject?.text ?? subject,
    body: maskedBody?.text ?? body,
    received_at: new Date().toISOString(),
    ...context.request,
    mask_pii: maskingOn,
  });
  return {
    result,
    piiMaskedCount:
      (maskedSubject ? totalMasked(maskedSubject.counts) : 0) +
      (maskedBody ? totalMasked(maskedBody.counts) : 0),
    timezone: context.request.timezone,
    categories: context.categories.map(({ id, name, basePriority }) => ({
      id,
      name,
      basePriority,
    })),
  };
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

async function loadClassifyContext(emailAccountId: string, fromEmail: string) {
  const [timezone, categories, contact] = await Promise.all([
    resolveMailboxTimezone({
      emailAccountId,
      logger: createScopedLogger("categoraize/timezone"),
    }),
    getCategoryVectors(emailAccountId),
    fromEmail
      ? prisma.categorizeContact.findUnique({
          where: { emailAccountId_email: { emailAccountId, email: fromEmail } },
          select: { role: true, isVip: true },
        })
      : null,
  ]);

  const matching = await getLabelMatching(
    emailAccountId,
    categories.map((category) => category.threshold),
  );

  const request = {
    timezone,
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
      slug: categorySlugFor(category.name),
    })),
    threshold: matching.threshold,
    // Labels are compared mean-centred against the account's own mail.
    background: matching.background,
    // Free/busy from the user's connected calendars; null (no boost) when none.
    calendar_busy: await getCalendarBusyForPriority({
      emailAccountId,
      timezone,
      logger: createScopedLogger("categoraize/calendar"),
    }),
  } satisfies Partial<CategoraizeClassifyRequest>;

  return { categories, request };
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
