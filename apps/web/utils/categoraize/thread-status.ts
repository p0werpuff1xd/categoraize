import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { threadStatusLocally } from "@/utils/categoraize/client";
import { runCategoraizeCascade } from "@/utils/categoraize/features";
import { extractEmailAddress } from "@/utils/email";
import type { ModelType } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ConversationStatus } from "@/utils/reply-tracker/conversation-status-config";
import type { EmailForLLM, RuleWithActions } from "@/utils/types";

const AUTOMATED_SENDER =
  /^(?:no-?reply|do-?not-?reply|notifications?|mailer-daemon|alerts?)@/i;

/**
 * Reply Zero status, local first: the CategorAIze service decides from
 * tagger signals (requests, questions, promises, thanks). Only when it is
 * unsure, and only for users who opted in to external AI, the thread goes to
 * the original LLM classifier. Without consent the local answer is used, so
 * Reply Zero keeps working without the external AI.
 */
export function determineThreadStatusCascade({
  emailAccount,
  threadMessages,
  modelType,
  userSentLastEmail = false,
  conversationRules = [],
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  threadMessages: EmailForLLM[];
  modelType?: ModelType;
  userSentLastEmail?: boolean;
  conversationRules?: RuleWithActions[];
  logger: Logger;
}): Promise<{ status: ConversationStatus; rationale: string }> {
  const userAddress = emailAccount.email.toLowerCase();

  return runCategoraizeCascade({
    feature: "replyStatus",
    userId: emailAccount.userId,
    logger,
    local: async () => {
      const messages = threadMessages.map((message, index) => {
        const sender = (
          extractEmailAddress(message.from) || message.from
        ).toLowerCase();
        const isLast = index === threadMessages.length - 1;
        return {
          from_user: isLast ? userSentLastEmail : sender === userAddress,
          subject: message.subject ?? "",
          body: (message.content ?? "").slice(0, 8000),
          automated: AUTOMATED_SENDER.test(sender),
        };
      });
      const result = await threadStatusLocally(messages);
      return {
        confident: result.confident,
        result: {
          status: result.status as ConversationStatus,
          rationale: `CategorAIze: ${result.reason}${result.confident ? "" : " (unsure)"}`,
        },
      };
    },
    llm: async (localResult) => {
      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages,
        modelType,
        userSentLastEmail,
        conversationRules,
      });
      return localResult
        ? {
            ...result,
            rationale: `CategorAIze was unsure, so the external AI decided: ${result.rationale}`,
          }
        : result;
    },
  });
}
