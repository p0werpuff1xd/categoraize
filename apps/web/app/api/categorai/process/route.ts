import { NextResponse } from "next/server";
import { CategorizePriorityLevel } from "@/generated/prisma/client";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import prisma from "@/utils/prisma";
import { classifyWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { scrubCategoraiizePii } from "@/utils/categorai/pii-scrubber";
import { processCategoraiizeMessage } from "./validation";

export const maxDuration = 60;

export const POST = withError(
  "categorai/process",
  withQstashOrInternal(async (request) => {
    const body = processCategoraiizeMessage.parse(await request.json());
    const result = await classifyWithIntelligenceService({
      email_vector: body.emailVector,
      categories: body.categories,
      threshold: body.threshold,
      subject: scrubCategoraiizePii(body.subject),
      body: scrubCategoraiizePii(body.body),
      message_at: body.messageAt,
      timezone: body.timezone,
      priority_factors: body.priorityFactors,
    });

    const priority = mapPriority(result.priority.level);
    const factors = result.priority.factors;
    const processingKey = `${body.threadId}:${body.messageId}`;

    const classification = await prisma.categorizeClassification.upsert({
      where: {
        emailAccountId_threadId_messageId: {
          emailAccountId: body.emailAccountId,
          threadId: body.threadId,
          messageId: body.messageId,
        },
      },
      create: {
        emailAccountId: body.emailAccountId,
        threadId: body.threadId,
        messageId: body.messageId,
        processingKey,
        categoryId: result.category_id,
        categoryName: result.category_name,
        confidence: result.similarity,
        priority,
        priorityBand: result.priority.level,
        priorityScore: result.priority.score * 100,
        urgency: Math.round(factors.urgency * 5),
        importance: Math.round(factors.sender * 5),
        detectedLang: result.language,
        summary: result.summary.join(" "),
        actionDirective: result.instructions[0]?.action,
        processingStatus: "COMPLETED",
        rawPriorityScore: result.priority.score,
        deadlineFactor: factors.deadline,
        senderFactor: factors.sender,
        calendarFactor: factors.calendar,
        priorityDampener: result.priority.dampener,
      },
      update: {
        categoryId: result.category_id,
        categoryName: result.category_name,
        confidence: result.similarity,
        priority,
        priorityBand: result.priority.level,
        priorityScore: result.priority.score * 100,
        urgency: Math.round(factors.urgency * 5),
        importance: Math.round(factors.sender * 5),
        detectedLang: result.language,
        summary: result.summary.join(" "),
        actionDirective: result.instructions[0]?.action,
        processingStatus: "COMPLETED",
        processingError: null,
        rawPriorityScore: result.priority.score,
        deadlineFactor: factors.deadline,
        senderFactor: factors.sender,
        calendarFactor: factors.calendar,
        priorityDampener: result.priority.dampener,
      },
    });

    await prisma.categorizeDeadlineAlert.deleteMany({
      where: {
        emailAccountId: body.emailAccountId,
        threadId: body.threadId,
        messageId: body.messageId,
        status: { not: "COMPLETED" },
      },
    });

    const pendingDeadlines = result.deadlines.filter(
      (deadline) => deadline.due_date && deadline.needs_review,
    );
    const validatedDeadlines = result.deadlines.filter(
      (deadline) => deadline.due_date && !deadline.needs_review,
    );
    const deadlines = [...pendingDeadlines, ...validatedDeadlines];

    if (deadlines.length > 0) {
      await prisma.categorizeDeadlineAlert.createMany({
        data: deadlines.map((deadline) => ({
          emailAccountId: body.emailAccountId,
          threadId: body.threadId,
          messageId: body.messageId,
          title: deadline.source_text,
          sourceText: deadline.source_text,
          dueDate: new Date(deadline.due_date as string),
          timezone: body.timezone,
          confidence: deadline.confidence,
          needsReview: deadline.needs_review,
          priority,
        })),
      });
    }

    return NextResponse.json({
      classificationId: classification.id,
      status: result.status,
      deadlines: result.deadlines,
      persistedDeadlineCount: deadlines.length,
    });
  }),
);

function mapPriority(level: string): CategorizePriorityLevel {
  if (level === "P5") return CategorizePriorityLevel.URGENT;
  if (level === "P4") return CategorizePriorityLevel.HIGH;
  if (level === "P3") return CategorizePriorityLevel.MEDIUM;
  return CategorizePriorityLevel.LOW;
}
