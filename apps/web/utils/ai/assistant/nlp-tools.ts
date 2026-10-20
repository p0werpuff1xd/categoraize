import { z } from "zod";
import { tool, type InferUITool } from "ai";
import { createEmailProvider } from "@/utils/email/provider";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { analyzeEmailWithNlp, submitNlpFeedback } from "@/utils/nlp/client";

const analyzeEmailInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("Message ID returned by searchInbox."),
});

const feedbackInputSchema = z.object({
  messageId: z
    .string()
    .trim()
    .min(1)
    .describe("Message ID previously analyzed."),
  correctedCategory: z
    .string()
    .trim()
    .min(1)
    .describe("The category selected by the user."),
});

type NlpToolOptions = {
  emailAccountId: string;
  provider: string;
  userId: string;
  logger: Logger;
};

export const analyzeEmailTool = ({
  emailAccountId,
  provider,
  userId,
  logger,
}: NlpToolOptions) =>
  tool({
    description:
      "Analyze one email with the CategorAIze NLP pipeline. Use readEmail or searchInbox first to obtain a valid message ID. This returns category predictions, extracted actions/deadlines, and priority; it does not change the email.",
    inputSchema: analyzeEmailInputSchema,
    execute: async ({ messageId }) => {
      try {
        const [emailProvider, categories] = await Promise.all([
          createEmailProvider({ emailAccountId, provider, logger }),
          prisma.category.findMany({
            where: { emailAccountId },
            orderBy: { name: "asc" },
            select: { name: true, description: true },
          }),
        ]);
        const message = await emailProvider.getMessage(messageId);
        const email = getEmailForLLM(message, { maxLength: 12_000 });

        return await analyzeEmailWithNlp({
          userId,
          emailId: message.id,
          subject: email.subject,
          body: email.content,
          messageDate: email.date?.toISOString() ?? message.date,
          categoryDescriptions: categories.map((category) => ({
            name: category.name,
            description: category.description ?? category.name,
          })),
        });
      } catch (error) {
        logger.warn("NLP email analysis failed", { error });
        return { error: "Email analysis is temporarily unavailable." };
      }
    },
  });

export const correctEmailCategoryTool = ({ userId, logger }: NlpToolOptions) =>
  tool({
    description:
      "Teach the NLP classifier the correct category after the user explicitly corrects an earlier analysis. This changes the personalized NLP model only; it does not label or move the email.",
    inputSchema: feedbackInputSchema,
    execute: async ({ messageId, correctedCategory }) => {
      try {
        return await submitNlpFeedback({
          userId,
          emailId: messageId,
          correctedCategory,
        });
      } catch (error) {
        logger.warn("NLP category feedback failed", { error });
        return { error: "Could not save the NLP correction." };
      }
    },
  });

export type AnalyzeEmailTool = InferUITool<ReturnType<typeof analyzeEmailTool>>;
export type CorrectEmailCategoryTool = InferUITool<
  ReturnType<typeof correctEmailCategoryTool>
>;
